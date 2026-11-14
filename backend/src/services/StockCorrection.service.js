const httpStatus = require('http-status');
const { subMonths } = require('date-fns');

const ApiError = require('../utils/ApiError');
const { assertNoDuplicateLines } = require('../utils/documentLines');
const prisma = require('./prisma');
const { runStockTransaction } = require('../utils/stockTransaction');

// Get StockCorrection by ID
const getStockCorrectionById = async (id) => {
  try {
    // Validate ID
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid stock correction ID');
    }
    const stockCorrection = await prisma.stockCorrection.findUnique({
      where: { id },
      include: {
        store: true,
        shop: true,
        purchase: true,
        transfer: true,
        createdBy: true,
        updatedBy: true,
        items: {
          include: {
            product: true,
            subProduct: true,

            batch: true,
            unitOfMeasure: true,
          },
        },
      },
    });
    return stockCorrection;
  } catch (error) {
    // Check if it's a Prisma error
    if (error.code) {
      console.error('Prisma error code:', error.code);
    }

    // Check database connection
    if (
      error.message.includes('connect') ||
      error.message.includes('connection')
    ) {
      console.error('Database connection error');
    }

    // Check for invalid ID format
    if (
      error.message.includes('Invalid value') ||
      error.message.includes('malformed')
    ) {
      console.error('Invalid ID format');
    }

    throw error;
  }
};

const getStockCorrectionsByPurchaseId = async (purchaseId) => {
  const stockCorrections = await prisma.stockCorrection.findMany({
    where: {
      purchaseId,
    },
    include: {
      store: true,
      shop: true,
      purchase: true,
      transfer: true,
      createdBy: true,
      updatedBy: true,
      items: {
        include: {
          product: true,
          subProduct: true,

          batch: true,
          unitOfMeasure: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc', // Optional: order by creation date, newest first
    },
  });
  return stockCorrections;
};
// Get StockCorrection by reference
const getStockCorrectionByReference = async (reference) => {
  const stockCorrection = await prisma.stockCorrection.findFirst({
    where: { reference },
  });
  return stockCorrection;
};

// Get all StockCorrections
const getAllStockCorrections = async ({ startDate, endDate } = {}) => {
  const whereClause = {};
  const threeMonthsAgo = subMonths(new Date(), 12);

  // Convert and validate dates
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  if (startDateObj && isNaN(startDateObj.getTime())) {
    throw new Error('Invalid startDate format');
  }
  if (endDateObj && isNaN(endDateObj.getTime())) {
    throw new Error('Invalid endDate format');
  }

  // Date filtering logic
  if (startDateObj && endDateObj) {
    whereClause.createdAt = { gte: startDateObj, lte: endDateObj };
  } else if (startDateObj) {
    whereClause.createdAt = { gte: startDateObj, lte: new Date() };
  } else if (endDateObj) {
    whereClause.createdAt = { gte: threeMonthsAgo, lte: endDateObj };
  } else {
    whereClause.createdAt = { gte: threeMonthsAgo };
  }

  const stockCorrections = await prisma.stockCorrection.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reference: true,
      reason: true,
      status: true,
      notes: true,
      createdAt: true,
      shortCode: true,
    },
  });

  return {
    stockCorrections,
    count: stockCorrections.length,
  };
};
const generateShortCode = async () => {
  try {
    // Find the highest existing SC number (MySQL; skips SC-EMG-* fallback codes)
    const result = await prisma.$queryRaw`
      SELECT MAX(CAST(SUBSTRING(shortCode, 4) AS UNSIGNED)) as maxNumber
      FROM stock_corrections
      WHERE shortCode REGEXP '^SC-[0-9]+$'
    `;

    const maxNumber = Number(result[0]?.maxNumber || 0);
    const nextNumber = maxNumber + 1;

    return `SC-${String(nextNumber).padStart(6, '0')}`;
  } catch (error) {
    // Fallback: Use timestamp
    const timestamp = Date.now();
    return `SC-EMG-${timestamp.toString().slice(-8)}`;
  }
};
// Every item must name a batch that belongs to its product (and sub-product)
const validateItemBatches = async (items) => {
  items.forEach((item, index) => {
    if (!item.batchId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: batchId is required`,
      );
    }
  });

  const batches = await prisma.productBatch.findMany({
    where: { id: { in: [...new Set(items.map((item) => item.batchId))] } },
    select: { id: true, productId: true, subProductId: true },
  });

  items.forEach((item, index) => {
    const batch = batches.find((b) => b.id === item.batchId);
    if (!batch) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: Batch not found`,
      );
    }
    if (batch.productId !== item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: Batch does not belong to the specified product`,
      );
    }
    if (item.subProductId && batch.subProductId !== item.subProductId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: Batch does not belong to the specified subproduct`,
      );
    }
  });
};

// A correction adjusts exactly one location: a store or a shop
const validateSingleLocation = (storeId, shopId) => {
  if (!storeId && !shopId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Either store or shop must be specified',
    );
  }
  if (storeId && shopId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Specify either a store or a shop, not both',
    );
  }
};

// Create StockCorrection
const createStockCorrection = async (stockCorrectionBody, userId) => {
  // Check if reference already exists
  const shortCode = await generateShortCode();

  // Parse items if it's a string
  const { items: itemsString, ...restStockCorrectionBody } =
    stockCorrectionBody;
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Stock correction must have at least one item',
    );
  }

  assertNoDuplicateLines(items, 'Stock correction');

  // Validate individual item properties
  items.forEach((item, index) => {
    // productId is always required
    if (!item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: productId is required`,
      );
    }

    if (!item.unitOfMeasureId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: unitOfMeasureId is required`,
      );
    }

    if (
      item.quantity === undefined ||
      item.quantity === null ||
      Number.isNaN(item.quantity)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }

    if (item.quantity === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} quantity cannot be zero`,
      );
    }
  });

  // Get all product IDs and subproduct IDs to validate relationships
  const productIds = items.map((item) => item.productId);
  const subProductIds = items
    .filter((item) => item.subProductId)
    .map((item) => item.subProductId);

  // Fetch products to validate they exist
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

  // Fetch subproducts to validate they exist and belong to correct products
  const subProducts = await prisma.subProduct.findMany({
    where: {
      id: {
        in: subProductIds,
      },
    },
    select: {
      id: true,
      productId: true,
    },
  });

  // Validate that subproducts belong to the correct parent products
  items.forEach((item, index) => {
    // Check if product exists
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: Product not found`,
      );
    }

    if (item.subProductId) {
      const subProduct = subProducts.find((sp) => sp.id === item.subProductId);
      if (!subProduct) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1}: Subproduct not found`,
        );
      }

      // Check if subproduct belongs to the specified product
      if (subProduct.productId !== item.productId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${
            index + 1
          }: Subproduct does not belong to the specified product`,
        );
      }
    }
  });

  // Clean up empty string values
  const cleanedStockCorrectionBody = {
    ...restStockCorrectionBody,
    storeId:
      restStockCorrectionBody.storeId === ''
        ? null
        : restStockCorrectionBody.storeId,
    shopId:
      restStockCorrectionBody.shopId === ''
        ? null
        : restStockCorrectionBody.shopId,
    purchaseId:
      restStockCorrectionBody.purchaseId === ''
        ? null
        : restStockCorrectionBody.purchaseId,
    transferId:
      restStockCorrectionBody.transferId === ''
        ? null
        : restStockCorrectionBody.transferId,
  };

  // Validate location and batches
  validateSingleLocation(
    cleanedStockCorrectionBody.storeId,
    cleanedStockCorrectionBody.shopId,
  );
  await validateItemBatches(items);

  // Create the stock correction
  const stockCorrection = await prisma.stockCorrection.create({
    data: {
      ...cleanedStockCorrectionBody,
      shortCode, // Add this field
      createdById: userId,
      updatedById: userId,
      items: {
        create: items.map((item) => ({
          productId: item.productId,
          subProductId: item.subProductId || null,
          batchId: item.batchId || null,
          unitOfMeasureId: item.unitOfMeasureId,
          quantity: item.quantity,
        })),
      },
    },
    include: {
      items: {
        include: {
          unitOfMeasure: true,
          product: true,
          subProduct: true,
          batch: true,
        },
      },
    },
  });

  return stockCorrection;
};

// Update StockCorrection
const updateStockCorrection = async (
  stockCorrectionId,
  stockCorrectionBody,
  userId,
) => {
  // Check if stock correction exists
  const existingStockCorrection = await getStockCorrectionById(
    stockCorrectionId,
  );
  if (!existingStockCorrection) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Stock correction not found');
  }

  // Cannot update approved or rejected stock corrections
  if (existingStockCorrection.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot update ${existingStockCorrection.status.toLowerCase()} stock correction`,
    );
  }

  // Check if reference already exists (excluding current stock correction)
  if (
    stockCorrectionBody.reference &&
    stockCorrectionBody.reference !== existingStockCorrection.reference
  ) {
    if (await getStockCorrectionByReference(stockCorrectionBody.reference)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Stock correction reference already taken',
      );
    }
  }

  // Parse items if it's a string
  const { items: itemsString, ...restStockCorrectionBody } =
    stockCorrectionBody;
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Stock correction must have at least one item',
    );
  }

  assertNoDuplicateLines(items, 'Stock correction');

  // Validate individual item properties
  items.forEach((item, index) => {
    // productId is always required
    if (!item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: productId is required`,
      );
    }

    if (!item.unitOfMeasureId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: unitOfMeasureId is required`,
      );
    }

    if (
      item.quantity === undefined ||
      item.quantity === null ||
      Number.isNaN(item.quantity)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }

    if (item.quantity === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} quantity cannot be zero`,
      );
    }
  });

  // Get all product IDs and subproduct IDs to validate relationships
  const productIds = items.map((item) => item.productId);
  const subProductIds = items
    .filter((item) => item.subProductId)
    .map((item) => item.subProductId);

  // Fetch products to validate they exist
  const products = await prisma.product.findMany({
    where: {
      id: {
        in: productIds,
      },
    },
    select: {
      id: true,
    },
  });

  // Fetch subproducts to validate they exist and belong to correct products
  const subProducts = await prisma.subProduct.findMany({
    where: {
      id: {
        in: subProductIds,
      },
    },
    select: {
      id: true,
      productId: true,
    },
  });

  // Validate that subproducts belong to the correct parent products
  items.forEach((item, index) => {
    // Check if product exists
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: Product not found`,
      );
    }

    if (item.subProductId) {
      const subProduct = subProducts.find((sp) => sp.id === item.subProductId);
      if (!subProduct) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1}: Subproduct not found`,
        );
      }

      // Check if subproduct belongs to the specified product
      if (subProduct.productId !== item.productId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${
            index + 1
          }: Subproduct does not belong to the specified product`,
        );
      }
    }
  });

  // Clean up empty string values
  const cleanedStockCorrectionBody = {
    ...restStockCorrectionBody,
    storeId:
      restStockCorrectionBody.storeId === ''
        ? null
        : restStockCorrectionBody.storeId,
    shopId:
      restStockCorrectionBody.shopId === ''
        ? null
        : restStockCorrectionBody.shopId,
    purchaseId:
      restStockCorrectionBody.purchaseId === ''
        ? null
        : restStockCorrectionBody.purchaseId,
    transferId:
      restStockCorrectionBody.transferId === ''
        ? null
        : restStockCorrectionBody.transferId,
  };

  // Validate location (fields left out of the body keep their stored value)
  validateSingleLocation(
    cleanedStockCorrectionBody.storeId !== undefined
      ? cleanedStockCorrectionBody.storeId
      : existingStockCorrection.storeId,
    cleanedStockCorrectionBody.shopId !== undefined
      ? cleanedStockCorrectionBody.shopId
      : existingStockCorrection.shopId,
  );
  await validateItemBatches(items);

  // Update the stock correction inside a transaction
  const result = await runStockTransaction(async (tx) => {
    // Only edit while still pending (an approval may have happened meanwhile)
    const stillPending = await tx.stockCorrection.updateMany({
      where: { id: stockCorrectionId, status: 'PENDING' },
      data: { updatedById: userId, updatedAt: new Date() },
    });
    if (stillPending.count !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Stock correction is not pending',
      );
    }

    // Delete all existing items
    await tx.stockCorrectionItem.deleteMany({
      where: { correctionId: stockCorrectionId },
    });

    // Update stock correction with cleaned body and new items
    const stockCorrection = await tx.stockCorrection.update({
      where: { id: stockCorrectionId },
      data: {
        ...cleanedStockCorrectionBody,
        updatedById: userId,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            subProductId: item.subProductId || null,
            batchId: item.batchId || null,
            unitOfMeasureId: item.unitOfMeasureId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: {
          include: {
            unitOfMeasure: true,
            product: true,
            subProduct: true,
            batch: true,
          },
        },
      },
    });

    return stockCorrection;
  });

  return result;
};

// Apply a signed quantity change to one batch at the correction's location.
// Increments upsert the stock row; decrements are guarded so stock never goes
// negative (and a missing row is treated as zero stock).
const applyStockDelta = async (tx, { storeId, shopId }, item, delta, label) => {
  const quantity = Math.abs(delta);
  const model = storeId ? tx.storeStock : tx.shopStock;
  const locationWhere = storeId ? { storeId } : { shopId };

  if (delta > 0) {
    await model.upsert({
      where: storeId
        ? { storeId_batchId: { storeId, batchId: item.batchId } }
        : { shopId_batchId: { shopId, batchId: item.batchId } },
      update: { quantity: { increment: quantity } },
      create: {
        ...locationWhere,
        batchId: item.batchId,
        quantity,
        unitOfMeasureId: item.unitOfMeasureId,
        status: 'Available',
      },
    });
    return;
  }

  const updated = await model.updateMany({
    where: {
      ...locationWhere,
      batchId: item.batchId,
      quantity: { gte: quantity },
    },
    data: { quantity: { decrement: quantity } },
  });
  if (updated.count !== 1) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient stock for ${label} (Batch: ${item.batchId}): Required ${quantity}`,
    );
  }
};

// Delete StockCorrection
const deleteStockCorrection = async (id, userId) => {
  const existingStockCorrection = await getStockCorrectionById(id);
  if (!existingStockCorrection) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Stock correction not found');
  }

  // Only an approved correction has moved stock
  const isApproved = existingStockCorrection.status === 'APPROVED';

  const result = await runStockTransaction(async (tx) => {
    // Lock the row at the status we read; if an approve/reject slipped in
    // between, stop instead of deleting with the wrong reversal decision.
    const claimed = await tx.stockCorrection.updateMany({
      where: { id, status: existingStockCorrection.status },
      data: { updatedById: userId, updatedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Stock correction status changed, please reload and try again',
      );
    }

    if (isApproved) {
      const location = {
        storeId: existingStockCorrection.storeId,
        shopId: existingStockCorrection.shopId,
      };
      const reversalNotes = `Stock correction reversal: ${existingStockCorrection.reason.toLowerCase()}`;
      const { items } = existingStockCorrection;

      // Reverse each line (opposite operation) and record a compensating
      // ledger row. Original ledger rows are kept for the audit trail.
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const productName =
          item.product?.name || `Product ID: ${item.productId}`;

        if (!item.batchId) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Cannot reverse "${productName}": item has no batch`,
          );
        }

        const isAddition = item.quantity > 0;

        // Was addition -> subtract (guarded); was subtraction -> add back
        // eslint-disable-next-line no-await-in-loop
        await applyStockDelta(
          tx,
          location,
          item,
          -item.quantity,
          `"${productName}"`,
        );

        // eslint-disable-next-line no-await-in-loop
        await tx.stockLedger.create({
          data: {
            batchId: item.batchId,
            ...(location.storeId
              ? { storeId: location.storeId }
              : { shopId: location.shopId }),
            // the id part keeps it unique even if a short code is reused after a delete
            invoiceNo: `REV-${
              existingStockCorrection.shortCode
            }-${existingStockCorrection.id.slice(0, 8)}-${i + 1}`,
            movementType: isAddition ? 'OUT' : 'IN',
            quantity: Math.abs(item.quantity),
            unitOfMeasureId: item.unitOfMeasureId,
            reference: location.storeId
              ? `STOCK-CORRECTION-REVERSAL-${existingStockCorrection.reason}`
              : `SHOP-CORRECTION-REVERSAL-${existingStockCorrection.reason}`,
            sourceType: 'STOCK_CORRECTION',
            sourceId: existingStockCorrection.id,
            userId,
            notes: reversalNotes,
            movementDate: new Date(),
          },
        });
      }
    }

    // Delete all stock correction items
    await tx.stockCorrectionItem.deleteMany({
      where: { correctionId: id },
    });

    // Delete the stock correction (ledger rows have no FK to it)
    await tx.stockCorrection.delete({
      where: { id },
    });

    // Create log entry
    await tx.log.create({
      data: {
        action: `Deleted stock correction ${existingStockCorrection.shortCode}${
          isApproved ? ' and reversed stock transactions' : ''
        }`,
        userId,
      },
    });

    return {
      message: `Stock correction deleted successfully${
        isApproved ? ' and stock transactions reversed' : ''
      }`,
      stockReversed: isApproved,
    };
  });

  return result;
};

// Approve StockCorrection
const approveStockCorrection = async (stockCorrectionId, userId) => {
  console.log('Starting approveStockCorrection:', {
    stockCorrectionId,
    userId,
  });

  // Quick pre-check for a friendly message; the real guard is the
  // compare-and-set inside the transaction below.
  const existing = await prisma.stockCorrection.findUnique({
    where: { id: stockCorrectionId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Stock correction not found');
  }

  if (existing.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Stock correction is already ${existing.status.toLowerCase()}`,
    );
  }

  const result = await runStockTransaction(async (tx) => {
    // Claim the correction first so concurrent approvals cannot both apply stock
    const flipped = await tx.stockCorrection.updateMany({
      where: { id: stockCorrectionId, status: 'PENDING' },
      data: { status: 'APPROVED', updatedById: userId },
    });
    if (flipped.count !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Stock correction is not pending',
      );
    }

    // Read the items after the claim so we apply exactly what was approved
    const stockCorrection = await tx.stockCorrection.findUnique({
      where: { id: stockCorrectionId },
      include: { items: true, store: true, shop: true },
    });

    if (!stockCorrection.storeId === !stockCorrection.shopId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Stock correction must have exactly one of store or shop',
      );
    }
    const location = {
      storeId: stockCorrection.storeId,
      shopId: stockCorrection.shopId,
    };
    const locationName = stockCorrection.storeId
      ? stockCorrection.store?.name || 'Store'
      : stockCorrection.shop?.name || 'Shop';

    // Get all unit of measures for the stock correction items
    const unitOfMeasureIds = stockCorrection.items.map(
      (item) => item.unitOfMeasureId,
    );
    const unitOfMeasures = await tx.unitOfMeasure.findMany({
      where: { id: { in: unitOfMeasureIds } },
    });
    const unitOfMeasureMap = unitOfMeasures.reduce((acc, uom) => {
      acc[uom.id] = uom;
      return acc;
    }, {});

    // Get all product details for better error messages
    const productIds = stockCorrection.items.map((item) => item.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, productCode: true },
    });

    const productMap = products.reduce((acc, product) => {
      acc[product.id] = product;
      return acc;
    }, {});

    stockCorrection.items.forEach((item) => {
      const productName =
        productMap[item.productId]?.name || `Product ID: ${item.productId}`;
      if (!item.batchId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `"${productName}" has no batch; edit the correction and select a batch`,
        );
      }
      if (!unitOfMeasureMap[item.unitOfMeasureId]) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Unit of measure not found for "${productName}"`,
        );
      }
    });

    // Check for negative stock BEFORE processing. Subtractions are summed per
    // batch so two lines on the same batch cannot together exceed stock.
    const requiredByBatch = {};
    stockCorrection.items.forEach((item) => {
      if (item.quantity < 0) {
        if (!requiredByBatch[item.batchId]) {
          requiredByBatch[item.batchId] = { required: 0, items: [] };
        }
        requiredByBatch[item.batchId].required += Math.abs(item.quantity);
        requiredByBatch[item.batchId].items.push(item);
      }
    });

    const batchIdsToCheck = Object.keys(requiredByBatch);
    if (batchIdsToCheck.length > 0) {
      const stockModel = location.storeId ? tx.storeStock : tx.shopStock;
      const stockRows = await stockModel.findMany({
        where: location.storeId
          ? { storeId: location.storeId, batchId: { in: batchIdsToCheck } }
          : { shopId: location.shopId, batchId: { in: batchIdsToCheck } },
        select: { batchId: true, quantity: true },
      });
      const availableByBatch = stockRows.reduce((acc, row) => {
        acc[row.batchId] = row.quantity;
        return acc;
      }, {});

      const insufficientStockItems = batchIdsToCheck
        .filter(
          (batchId) =>
            (availableByBatch[batchId] || 0) <
            requiredByBatch[batchId].required,
        )
        .map((batchId) => {
          const { productId } = requiredByBatch[batchId].items[0];
          const product = productMap[productId];
          return {
            productName: product?.name || `Product ID: ${productId}`,
            productCode: product?.productCode,
            batchId,
            required: requiredByBatch[batchId].required,
            available: availableByBatch[batchId] || 0,
          };
        });

      // If there are insufficient stock items, throw an error with product names
      if (insufficientStockItems.length > 0) {
        console.error(
          'Insufficient stock items found:',
          insufficientStockItems,
        );

        const errorDetails = insufficientStockItems
          .map((item) => {
            const productInfo = `${item.productName}${
              item.productCode ? ` (${item.productCode})` : ''
            }`;
            return `${productInfo} at ${locationName}: Required ${item.required}, Available ${item.available} Batch: ${item.batchId}`;
          })
          .join('; ');

        const errorMessage =
          insufficientStockItems.length === 1
            ? `Insufficient stock: ${errorDetails}`
            : `Insufficient stock for multiple items: ${errorDetails}`;

        throw new ApiError(httpStatus.BAD_REQUEST, errorMessage);
      }
    }

    // Apply each item sequentially; guarded decrements are the final guard
    const { items } = stockCorrection;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const product = productMap[item.productId];
      const productName = product?.name || `Product ID: ${item.productId}`;

      const isAddition = item.quantity > 0;
      const movementType = isAddition ? 'IN' : 'OUT';
      const absoluteQuantity = Math.abs(item.quantity);
      const notes = isAddition
        ? `Stock addition for "${productName}": ${stockCorrection.reason.toLowerCase()}`
        : `Stock subtraction for "${productName}": ${stockCorrection.reason.toLowerCase()}`;

      // eslint-disable-next-line no-await-in-loop
      await applyStockDelta(
        tx,
        location,
        item,
        item.quantity,
        `"${productName}" at ${locationName}`,
      );

      // Generate unique invoice number with timestamp and index
      const now = new Date();
      const dateStr = now.toISOString().replace(/[-:]/g, '').split('.')[0]; // YYYYMMDDTHHMMSS format
      // the id part keeps it unique even if a short code is reused after a delete
      const uniqueInvoiceNo = `${
        stockCorrection.shortCode || 'SC'
      }-${dateStr}-${stockCorrection.id.slice(0, 8)}-${index + 1}`;

      // eslint-disable-next-line no-await-in-loop
      await tx.stockLedger.create({
        data: {
          batchId: item.batchId,
          ...(location.storeId
            ? { storeId: location.storeId }
            : { shopId: location.shopId }),
          invoiceNo: uniqueInvoiceNo,
          movementType,
          quantity: absoluteQuantity,
          unitOfMeasureId: item.unitOfMeasureId,
          reference:
            stockCorrection.reference ||
            (location.storeId
              ? `STOCK-CORRECTION-${stockCorrection.reason}`
              : `SHOP-CORRECTION-${stockCorrection.reason}`),
          sourceType: 'STOCK_CORRECTION',
          sourceId: stockCorrectionId,
          userId,
          notes: `${notes} (${productName})`,
          movementDate: now,
        },
      });
    }

    // Create log entry with product details
    const productNames = stockCorrection.items
      .map((item) => {
        const product = productMap[item.productId];
        return product?.name || `Product ID: ${item.productId}`;
      })
      .join(', ');

    await tx.log.create({
      data: {
        action: `Approved stock correction ${
          stockCorrection.reference || stockCorrection.id
        } for products: ${productNames}`,
        userId,
      },
    });

    // Same shape as the previous tx.stockCorrection.update() return value
    return tx.stockCorrection.findUnique({
      where: { id: stockCorrectionId },
    });
  });

  console.log('Stock correction approved successfully');
  return result;
};

// Reject StockCorrection
const rejectStockCorrection = async (stockCorrectionId, userId) => {
  const stockCorrection = await getStockCorrectionById(stockCorrectionId);

  if (!stockCorrection) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Stock correction not found');
  }

  if (stockCorrection.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot reject ${stockCorrection.status.toLowerCase()} stock correction`,
    );
  }

  const updatedStockCorrection = await runStockTransaction(async (tx) => {
    // Compare-and-set so a concurrent approve cannot be overwritten
    const flipped = await tx.stockCorrection.updateMany({
      where: { id: stockCorrectionId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        updatedById: userId,
      },
    });
    if (flipped.count !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Stock correction is not pending',
      );
    }

    // Create log entry
    await tx.log.create({
      data: {
        action: `Rejected stock correction ${
          stockCorrection.reference || stockCorrection.id
        }`,
        userId,
      },
    });

    return tx.stockCorrection.findUnique({
      where: { id: stockCorrectionId },
    });
  });

  return updatedStockCorrection;
};

module.exports = {
  getStockCorrectionById,
  getStockCorrectionByReference,
  getAllStockCorrections,
  createStockCorrection,
  updateStockCorrection,
  deleteStockCorrection,
  approveStockCorrection,
  rejectStockCorrection,
  getStockCorrectionsByPurchaseId,
};
