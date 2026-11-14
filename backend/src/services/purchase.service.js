const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { assertNoDuplicateLines } = require('../utils/documentLines');
const prisma = require('./prisma');
const { runStockTransaction } = require('../utils/stockTransaction');

// Items in the order they were entered (lineNo); lines saved before lineNo
// existed all have 0 and fall back to creation order
const ITEM_ORDER = [{ lineNo: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];

// Get Purchase by ID
const getPurchaseById = async (id) => {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      store: true,
      createdBy: true,
      updatedBy: true,
      items: {
        include: {
          product: true,
          subProduct: true,

          batch: true,
          unitOfMeasure: true, // ✅ Added unit of measure
        },
        orderBy: ITEM_ORDER,
      },
    },
  });
  return purchase;
};

// Get Purchase by invoice number
const getPurchaseByInvoiceNo = async (invoiceNo) => {
  const purchase = await prisma.purchase.findFirst({
    where: { invoiceNo },
  });
  return purchase;
};

// Get all Purchases
const getAllPurchases = async (filter = {}) => {
  const {
    supplierId,
    storeId,
    status,
    paymentStatus,
    startDate,
    endDate,
    search,
  } = filter;

  const where = {};

  if (supplierId) {
    where.supplierId = supplierId;
  }

  if (storeId) {
    where.storeId = storeId;
  }

  if (status) {
    where.status = status;
  }

  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }

  if (startDate || endDate) {
    where.purchaseDate = {};
    if (startDate) {
      where.purchaseDate.gte = new Date(startDate);
    }
    if (endDate) {
      where.purchaseDate.lte = new Date(endDate);
    }
  }

  if (search) {
    where.OR = [
      // MySQL: no `mode` option (Prisma rejects it); the default collation
      // already matches case-insensitively
      { invoiceNo: { contains: search } },
      { notes: { contains: search } },
    ];
  }

  const purchases = await prisma.purchase.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      supplier: true,
      store: true,
      _count: {
        select: { items: true },
      },
    },
  });

  return {
    purchases,
    count: purchases.length,
  };
};
// Money columns hold 2 decimals; round JS arithmetic to match
const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

// Derive the payment status from the amount paid so far
const derivePaymentStatus = (amountPaid, grandTotal) => {
  if (amountPaid <= 0) return 'UNPAID';
  if (amountPaid < grandTotal) return 'PARTIALLY_PAID';
  return 'PAID';
};

// Fields the client may never set through create/update: the receipt status
// (only acceptPurchase changes it, together with booking the stock), the
// payment fields (only recordPayment changes them), totals (recomputed from
// the items) and audit columns
const stripSystemFields = (purchaseBody) => {
  const {
    items,
    status,
    paymentStatus,
    amountPaid,
    subTotal,
    grandTotal,
    totalProducts,
    id,
    createdById,
    updatedById,
    createdAt,
    updatedAt,
    ...rest
  } = purchaseBody;
  return { items, rest };
};

const createPurchase = async (purchaseBody, userId) => {
  // Check if invoice number already exists
  if (await getPurchaseByInvoiceNo(purchaseBody.invoiceNo)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice number already taken');
  }

  // Parse items if it's a string. A new purchase always starts PENDING and
  // UNPAID (see stripSystemFields).
  const { items: itemsString, rest: restPurchaseBody } =
    stripSystemFields(purchaseBody);
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Purchase must have at least one item',
    );
  }

  assertNoDuplicateLines(items, 'Purchase');

  // First, fetch all products to get their unitOfMeasureId
  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: {
      id: {
        in: productIds,
      },
    },
    select: {
      id: true,
      unitOfMeasureId: true,
    },
  });

  // Create a map for quick lookup
  const productUnitMap = products.reduce((map, product) => {
    map[product.id] = product.unitOfMeasureId;
    return map;
  }, {});

  // Validate items and use unitOfMeasureId from product (ignore frontend value)
  items.forEach((item, index) => {
    // Check required fields (now without unitOfMeasureId)
    if (!item.productId || !item.batchId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing required fields (productId or batchId)`,
      );
    }

    // Get unitOfMeasureId from product
    const unitOfMeasureId = productUnitMap[item.productId];
    if (!unitOfMeasureId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${
          index + 1
        }: Product not found or has no unit of measure assigned`,
      );
    }

    // Validate that subProduct belongs to the product if provided
    if (item.subProductId && !item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: subProductId provided but productId is missing`,
      );
    }

    if (item.quantity <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }
    if (item.unitPrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid unit price`,
      );
    }

    // Override the frontend unitOfMeasureId with the one from product
    item.unitOfMeasureId = unitOfMeasureId;
  });

  // Recalculate totalPrice for security
  const validatedItems = items.map((item) => ({
    ...item,
    totalPrice: roundMoney(item.quantity * item.unitPrice),
  }));

  // Convert purchaseDate to DateTime object
  const purchaseDate = new Date(restPurchaseBody.purchaseDate);
  if (Number.isNaN(purchaseDate.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid purchase date');
  }

  // Calculate totals
  const totalProducts = validatedItems.length;
  const subTotal = roundMoney(
    validatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
  );
  const grandTotal = subTotal;

  // Create the purchase transaction
  const result = await runStockTransaction(async (tx) => {
    // Create the purchase
    const purchase = await tx.purchase.create({
      data: {
        ...restPurchaseBody,
        purchaseDate,
        totalProducts,
        subTotal,
        grandTotal,
        createdById: userId,

        items: {
          create: validatedItems.map((item, index) => {
            const itemData = {
              lineNo: index,
              productId: item.productId,
              batchId: item.batchId,
              unitOfMeasureId: item.unitOfMeasureId, // Now from product, not frontend
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            };

            if (item.subProductId) {
              itemData.subProductId = item.subProductId;
            }

            return itemData;
          }),
        },
      },
      include: {
        items: {
          include: {
            product: true,
            subProduct: true,
            batch: true,
            unitOfMeasure: true,
          },
          orderBy: ITEM_ORDER,
        },
        supplier: true,
        store: true,
        createdBy: true,
      },
    });

    return purchase;
  });

  return result;
};
const updatePurchase = async (purchaseId, purchaseBody, userId) => {
  // Check if purchase exists
  const existingPurchase = await getPurchaseById(purchaseId);
  if (!existingPurchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }

  // Check if current user is the creator of this purchase
  if (existingPurchase.createdById !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only the creator can update this purchase',
    );
  }

  // Once accepted (or rejected) the stock has been booked against these
  // items, so the document can no longer be edited
  if (existingPurchase.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only pending purchases can be edited',
    );
  }

  // Check if invoice number already exists (excluding current purchase)
  if (
    purchaseBody.invoiceNo &&
    purchaseBody.invoiceNo !== existingPurchase.invoiceNo
  ) {
    if (await getPurchaseByInvoiceNo(purchaseBody.invoiceNo)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invoice number already taken',
      );
    }
  }

  // Parse items if it's a string. Status / payment fields are dropped (see
  // stripSystemFields).
  const { items: itemsString, rest: restPurchaseBody } =
    stripSystemFields(purchaseBody);
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Purchase must have at least one item',
    );
  }

  assertNoDuplicateLines(items, 'Purchase');

  // First, fetch all products to get their unitOfMeasureId
  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: {
      id: {
        in: productIds,
      },
    },
    select: {
      id: true,
      unitOfMeasureId: true,
    },
  });

  // Create a map for quick lookup
  const productUnitMap = products.reduce((map, product) => {
    map[product.id] = product.unitOfMeasureId;
    return map;
  }, {});

  // Validate items and use unitOfMeasureId from product (ignore frontend value)
  items.forEach((item, index) => {
    // Check required fields (now without unitOfMeasureId)
    if (!item.productId || !item.batchId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing required fields (productId or batchId)`,
      );
    }

    // Get unitOfMeasureId from product
    const unitOfMeasureId = productUnitMap[item.productId];
    if (!unitOfMeasureId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${
          index + 1
        }: Product not found or has no unit of measure assigned`,
      );
    }

    // Validate that subProduct belongs to the product if provided
    if (item.subProductId && !item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: subProductId provided but productId is missing`,
      );
    }

    if (item.quantity <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }
    if (item.unitPrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid unit price`,
      );
    }

    // Override the frontend unitOfMeasureId with the one from product
    item.unitOfMeasureId = unitOfMeasureId;
  });

  // Recalculate totalPrice for security
  const validatedItems = items.map((item) => ({
    ...item,
    totalPrice: roundMoney(item.quantity * item.unitPrice),
  }));

  // Convert purchaseDate to DateTime object if provided
  let { purchaseDate } = existingPurchase;
  if (restPurchaseBody.purchaseDate) {
    purchaseDate = new Date(restPurchaseBody.purchaseDate);
    if (Number.isNaN(purchaseDate.getTime())) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid purchase date');
    }
  }

  // Calculate totals
  const totalProducts = validatedItems.length;
  const subTotal = roundMoney(
    validatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
  );
  const grandTotal = subTotal;

  // Update the purchase transaction
  const result = await runStockTransaction(async (tx) => {
    // Compare-and-set guard: lock the row and make sure it is still PENDING,
    // so an accept that lands between the check above and this edit can't
    // leave the document out of step with the stock it booked
    const stillPending = await tx.purchase.updateMany({
      where: { id: purchaseId, status: 'PENDING' },
      // updatedAt always changes, so MySQL reports the row as affected
      data: { updatedById: userId, updatedAt: new Date() },
    });
    if (stillPending.count !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Only pending purchases can be edited',
      );
    }

    // A payment may already be recorded on a pending purchase: the new total
    // can't go below it, and the payment status follows the new total
    const { amountPaid } = await tx.purchase.findUnique({
      where: { id: purchaseId },
      select: { amountPaid: true },
    });
    if (Number(amountPaid) > grandTotal) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `The new total (${grandTotal.toFixed(
          2,
        )}) is less than the amount already paid (${Number(amountPaid).toFixed(
          2,
        )})`,
      );
    }

    // First delete all existing items
    await tx.purchaseItem.deleteMany({
      where: {
        purchaseId,
      },
    });

    // Update the purchase
    const purchase = await tx.purchase.update({
      where: {
        id: purchaseId,
      },
      data: {
        ...restPurchaseBody,
        purchaseDate,
        totalProducts,
        subTotal,
        grandTotal,
        paymentStatus: derivePaymentStatus(Number(amountPaid), grandTotal),
        items: {
          create: validatedItems.map((item, index) => {
            const itemData = {
              lineNo: index,
              productId: item.productId,
              batchId: item.batchId,
              unitOfMeasureId: item.unitOfMeasureId, // Now from product, not frontend
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            };

            if (item.subProductId) {
              itemData.subProductId = item.subProductId;
            }

            return itemData;
          }),
        },
      },
      include: {
        items: {
          include: {
            product: true,
            subProduct: true,
            batch: true,
            unitOfMeasure: true,
          },
          orderBy: ITEM_ORDER,
        },
        supplier: true,
        store: true,
      },
    });

    return purchase;
  });

  return result;
};

// Sum item quantities per batch, so a batch listed on several lines of the
// same purchase is moved with one guarded update
const sumQuantitiesByBatch = (items) =>
  items.reduce((acc, item) => {
    const existing = acc.get(item.batchId);
    acc.set(item.batchId, {
      batchId: item.batchId,
      batchNumber: item.batch ? item.batch.batchNumber : item.batchId,
      unitOfMeasureId: item.unitOfMeasureId,
      quantity: (existing ? existing.quantity : 0) + item.quantity,
    });
    return acc;
  }, new Map());

// Delete Purchase
const deletePurchase = async (id, userId) => {
  const existingPurchase = await getPurchaseById(id);
  if (!existingPurchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }

  await runStockTransaction(async (tx) => {
    // Compare-and-set guard: lock the row and make sure its status hasn't
    // changed since it was read, so a concurrent accept or delete can't
    // slip in between and get its stock reversed twice (or not at all)
    const locked = await tx.purchase.updateMany({
      where: { id, status: existingPurchase.status },
      // updatedAt always changes, so MySQL reports the row as affected
      data: { updatedById: userId, updatedAt: new Date() },
    });
    if (locked.count !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Purchase was changed by another request, please reload and try again',
      );
    }

    // Stock was booked in only if the purchase was received. The ledger
    // check catches old purchases whose status was set to APPROVED (now
    // RECEIVED) but whose stock booking failed (status used to be saved
    // separately).
    let wasApproved = existingPurchase.status === 'RECEIVED';
    if (wasApproved) {
      const existingLedgerEntries = await tx.stockLedger.count({
        where: {
          movementType: 'IN',
          OR: [
            { sourceType: 'PURCHASE', sourceId: existingPurchase.id },
            // Rows written before ledger rows carried their source
            { sourceType: null, reference: existingPurchase.invoiceNo },
          ],
        },
      });
      wasApproved = existingLedgerEntries > 0;
    }

    if (wasApproved) {
      // 1. Take the stock back out of the store, but only if it is still
      // there. If it has been transferred or sold the purchase can't be
      // reversed without making the store's stock wrong.
      const batchTotals = [
        ...sumQuantitiesByBatch(existingPurchase.items).values(),
      ];
      const decrements = await Promise.all(
        batchTotals.map((batchTotal) =>
          tx.storeStock.updateMany({
            where: {
              storeId: existingPurchase.storeId,
              batchId: batchTotal.batchId,
              quantity: { gte: batchTotal.quantity },
            },
            data: {
              quantity: { decrement: batchTotal.quantity },
            },
          }),
        ),
      );
      decrements.forEach((decrement, index) => {
        if (decrement.count !== 1) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Insufficient stock to reverse purchase ${existingPurchase.invoiceNo}: batch ${batchTotals[index].batchNumber} has already been moved out of this store (transferred or sold)`,
          );
        }
      });

      // 2. Create reversal ledger entries
      await Promise.all(
        existingPurchase.items.map((item) =>
          tx.stockLedger.create({
            data: {
              batchId: item.batchId,
              storeId: existingPurchase.storeId,
              movementType: 'OUT',
              quantity: item.quantity,
              unitOfMeasureId: item.unitOfMeasureId,
              reference: `PURCHASE-DELETE-${existingPurchase.invoiceNo}`,
              sourceType: 'PURCHASE',
              sourceId: existingPurchase.id,
              userId,
              notes: `Stock reversed from deleted purchase ${existingPurchase.invoiceNo}`,
              movementDate: new Date(),
            },
          }),
        ),
      );
    }

    // Delete all purchase items
    await tx.purchaseItem.deleteMany({
      where: { purchaseId: id },
    });

    // Delete the purchase
    await tx.purchase.delete({
      where: { id },
    });

    // Create log entry
    await tx.log.create({
      data: {
        action: `Deleted purchase ${existingPurchase.invoiceNo}${
          wasApproved ? ' and reversed stock' : ''
        }`,
        userId,
      },
    });
  });

  return { message: 'Purchase deleted successfully' };
};
// Receive (book the stock in) or reject a PENDING purchase. `requestedStatus`
// is 'RECEIVED' or 'REJECTED'; the legacy value 'APPROVED' means 'RECEIVED'.
const acceptPurchase = async (purchaseId, requestedStatus, userId) => {
  try {
    const status =
      requestedStatus === 'APPROVED' ? 'RECEIVED' : requestedStatus;
    if (!['RECEIVED', 'REJECTED'].includes(status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'status must be RECEIVED or REJECTED',
      );
    }

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        items: {
          include: {
            batch: true,
            unitOfMeasure: true,
          },
        },
        store: true,
      },
    });

    if (!purchase) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
    }

    // Cheap pre-check for a clear message; the compare-and-set inside the
    // transaction below is the real guard against concurrent requests
    if (purchase.status === 'RECEIVED') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Purchase already received');
    }
    if (purchase.status === 'REJECTED') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Purchase already rejected');
    }

    const result = await runStockTransaction(async (tx) => {
      // Compare-and-set: only one request can move the purchase out of
      // PENDING, so stock is booked in exactly once
      const flipped = await tx.purchase.updateMany({
        where: { id: purchaseId, status: 'PENDING' },
        data: { status, updatedById: userId, updatedAt: new Date() },
      });
      if (flipped.count !== 1) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Purchase is no longer pending',
        );
      }

      const updatedPurchase = await tx.purchase.findUnique({
        where: { id: purchaseId },
      });

      // A rejected purchase books no stock
      if (status === 'REJECTED') {
        await tx.log.create({
          data: {
            action: `Rejected purchase ${purchase.invoiceNo}`,
            userId,
          },
        });

        return {
          purchase: updatedPurchase,
          message: 'Purchase rejected. No stock was booked in.',
        };
      }

      // Store stock: one upsert per batch (create the row as Available, or
      // add to it and keep it Available)
      const storeStockOperations = [
        ...sumQuantitiesByBatch(purchase.items).values(),
      ].map(({ batchId, quantity, unitOfMeasureId }) =>
        tx.storeStock.upsert({
          where: {
            storeId_batchId: {
              storeId: purchase.storeId,
              batchId,
            },
          },
          update: {
            quantity: { increment: quantity },
            // Ensure status remains Available when updating
            status: 'Available',
            unitOfMeasureId,
          },
          create: {
            storeId: purchase.storeId,
            batchId,
            quantity,
            status: 'Available',
            unitOfMeasureId,
          },
        }),
      );

      const stockLedgerOperations = [];

      purchase.items.forEach((item) => {
        const { quantity, unitOfMeasureId, batchId } = item;

        // Stock ledger operations
        stockLedgerOperations.push(
          tx.stockLedger.create({
            data: {
              batchId,
              storeId: purchase.storeId,
              movementType: 'IN',
              quantity,
              unitOfMeasureId,
              reference: purchase.invoiceNo,
              sourceType: 'PURCHASE',
              sourceId: purchase.id,
              userId,
              notes: `Purchase acceptance - ${purchase.invoiceNo}`,
              movementDate: purchase.purchaseDate,
            },
          }),
        );
      });

      // Execute all operations in parallel
      const [storeStockUpdates, stockLedgerEntries] = await Promise.all([
        Promise.all(storeStockOperations),
        Promise.all(stockLedgerOperations),
      ]);

      // Create log entry
      await tx.log.create({
        data: {
          action: `Received purchase ${purchase.invoiceNo} with ${purchase.items.length} items`,
          userId,
        },
      });

      return {
        purchase: updatedPurchase,
        stockLedgerEntries,
        storeStockUpdates,
      };
    });

    return result;
  } catch (error) {
    // Handle transaction errors specifically
    if (error.code === 'P2025') {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Related record not found during transaction',
      );
    }
    throw error;
  }
};
// Record what has been paid to the supplier so far (an absolute amount, not
// an increment). Allowed while PENDING or RECEIVED; a rejected purchase is
// never paid.
const recordPayment = async (purchaseId, amountPaidInput, userId) => {
  const amountPaid = Number(amountPaidInput);
  if (
    amountPaidInput === null ||
    amountPaidInput === undefined ||
    amountPaidInput === '' ||
    typeof amountPaidInput === 'boolean' ||
    !Number.isFinite(amountPaid) ||
    amountPaid < 0
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'amountPaid must be a number greater than or equal to 0',
    );
  }
  const rounded = roundMoney(amountPaid);

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, invoiceNo: true, status: true, grandTotal: true },
  });
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }
  if (purchase.status === 'REJECTED') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot record a payment on a rejected purchase',
    );
  }
  const grandTotal = Number(purchase.grandTotal);
  if (rounded > grandTotal) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `amountPaid cannot exceed the purchase total (${grandTotal.toFixed(2)})`,
    );
  }

  const paymentStatus = derivePaymentStatus(rounded, grandTotal);

  return runStockTransaction(async (tx) => {
    // Compare-and-set on the status and total read above, so a concurrent
    // reject or edit can't leave the payment out of step with the purchase
    const updated = await tx.purchase.updateMany({
      where: {
        id: purchaseId,
        status: purchase.status,
        // exact string: a JS number would be compared to DECIMAL as a float
        grandTotal: grandTotal.toFixed(2),
      },
      data: {
        amountPaid: rounded,
        paymentStatus,
        updatedById: userId,
        updatedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'Purchase was changed by another request, please reload and try again',
      );
    }

    await tx.log.create({
      data: {
        action: `Recorded payment of ${rounded.toFixed(2)} on purchase ${
          purchase.invoiceNo
        } (${paymentStatus})`,
        userId,
      },
    });

    return tx.purchase.findUnique({
      where: { id: purchaseId },
      include: { supplier: true, store: true },
    });
  });
};

module.exports = {
  getPurchaseById,
  getPurchaseByInvoiceNo,
  getAllPurchases,
  createPurchase,
  updatePurchase,
  deletePurchase,
  acceptPurchase,
  recordPayment,
};
