const httpStatus = require('http-status');
const { subMonths } = require('date-fns');

const ApiError = require('../utils/ApiError');
const { assertNoDuplicateLines } = require('../utils/documentLines');
const prisma = require('./prisma');
const { runStockTransaction } = require('../utils/stockTransaction');

// Never send password hashes or other account fields with a transfer
const USER_SUMMARY = { id: true, name: true, email: true };
const LOCATION_SUMMARY = { id: true, name: true, branchId: true };

// Get Transfer by ID
const getTransferById = async (id) => {
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      sourceStore: true,
      sourceShop: true,
      destStore: true,
      destShop: true,
      createdBy: { select: USER_SUMMARY },
      updatedBy: { select: USER_SUMMARY },
      items: {
        include: {
          product: true,
          subProduct: true,

          batch: true,
          unitOfMeasure: true, // ✅ Added unit of measure
        },
      },
    },
  });
  return transfer;
};

// Run async work one item at a time (stock movements inside a transaction
// must be sequential so each guard sees the previous decrement).
const runSequentially = (list, fn) =>
  list.reduce(
    (prev, entry, index) => prev.then(() => fn(entry, index)),
    Promise.resolve(),
  );

const ENTITY_TYPES = ['STORE', 'SHOP'];

// Resolve the store/shop id that matches a transfer side's type
const getSideLocationId = (type, storeId, shopId) => {
  if (type === 'STORE') return storeId || null;
  if (type === 'SHOP') return shopId || null;
  return null;
};

const describeLocation = (type, location, locationId) =>
  `${type === 'STORE' ? 'store' : 'shop'} ${
    location && location.name ? location.name : locationId
  }`;

// Guarded decrement: only succeeds when the row holds at least `quantity`.
// Throws 400 with the available amount otherwise. Never creates or deletes rows.
const decrementStockOrThrow = async (
  tx,
  { type, locationId, batchId, quantity, label, messagePrefix = '' },
) => {
  const model = type === 'STORE' ? tx.storeStock : tx.shopStock;
  const locationWhere =
    type === 'STORE' ? { storeId: locationId } : { shopId: locationId };

  const decremented = await model.updateMany({
    where: { ...locationWhere, batchId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });

  if (decremented.count !== 1) {
    const [row, batch] = await Promise.all([
      model.findFirst({ where: { ...locationWhere, batchId } }),
      tx.productBatch.findUnique({
        where: { id: batchId },
        select: { batchNumber: true },
      }),
    ]);
    const available = row ? row.quantity : 0;
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${messagePrefix}Insufficient stock for batch ${
        batch ? batch.batchNumber : batchId
      } at ${label}: available ${available}, requested ${quantity}`,
    );
  }
};

// Increment stock at a location, creating the row if it does not exist yet
const incrementStock = (tx, { type, locationId, batchId, quantity, uomId }) => {
  if (type === 'STORE') {
    return tx.storeStock.upsert({
      where: { storeId_batchId: { storeId: locationId, batchId } },
      update: { quantity: { increment: quantity } },
      create: {
        storeId: locationId,
        batchId,
        quantity,
        unitOfMeasureId: uomId,
        status: 'Available',
      },
    });
  }
  return tx.shopStock.upsert({
    where: { shopId_batchId: { shopId: locationId, batchId } },
    update: { quantity: { increment: quantity } },
    create: {
      shopId: locationId,
      batchId,
      quantity,
      unitOfMeasureId: uomId,
      status: 'Available',
    },
  });
};

// Validate source/destination types, matching ids and that they differ
const validateTransferEndpoints = (body) => {
  if (!ENTITY_TYPES.includes(body.sourceType)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Source type must be STORE or SHOP',
    );
  }

  if (!ENTITY_TYPES.includes(body.destinationType)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Destination type must be STORE or SHOP',
    );
  }

  if (body.sourceType === 'STORE' && !body.sourceStoreId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Source store ID is required');
  }

  if (body.sourceType === 'SHOP' && !body.sourceShopId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Source shop ID is required');
  }

  if (body.destinationType === 'STORE' && !body.destStoreId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Destination store ID is required',
    );
  }

  if (body.destinationType === 'SHOP' && !body.destShopId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Destination shop ID is required',
    );
  }

  // Check if source and destination are different
  if (
    (body.sourceType === 'STORE' &&
      body.destinationType === 'STORE' &&
      body.sourceStoreId === body.destStoreId) ||
    (body.sourceType === 'SHOP' &&
      body.destinationType === 'SHOP' &&
      body.sourceShopId === body.destShopId)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Source and destination cannot be the same',
    );
  }
};

// Validate that each item's batch exists and belongs to its product/subproduct
const validateItemBatches = async (items) => {
  const batchIds = [...new Set(items.map((item) => item.batchId))];
  const batches = await prisma.productBatch.findMany({
    where: { id: { in: batchIds } },
    select: {
      id: true,
      batchNumber: true,
      productId: true,
      subProductId: true,
    },
  });
  const batchMap = batches.reduce((acc, batch) => {
    acc[batch.id] = batch;
    return acc;
  }, {});

  items.forEach((item, index) => {
    const batch = batchMap[item.batchId];
    if (!batch) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: Batch not found`,
      );
    }
    if (batch.productId !== item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: Batch ${
          batch.batchNumber
        } does not belong to the specified product`,
      );
    }
    if (item.subProductId && batch.subProductId !== item.subProductId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: Batch ${
          batch.batchNumber
        } does not belong to the specified subproduct`,
      );
    }
  });
};
// Get product batch info by transfer ID

const getTransferBatchesById = async (transferId) => {
  try {
    // Fetch transfer with batch and their additional prices
    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        items: {
          select: {
            batch: {
              include: {
                AdditionalPrice: {
                  include: {
                    shop: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
                product: {
                  select: {
                    name: true,
                    productCode: true,
                  },
                },
                store: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    // Map batches with additional price info
    const batches = transfer.items.map((item) => {
      const { batch } = item;
      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        product: batch.product,
        store: batch.store,
        additionalPrices: batch.AdditionalPrice.map((p) => ({
          label: p.label,
          price: p.price,
          shop: {
            id: p.shop.id,
            name: p.shop.name,
          },
        })),
      };
    });

    return batches;
  } catch (error) {
    throw new Error(`Failed to get batches: ${error.message}`);
  }
};

// Get Transfer by reference
const getTransferByReference = async (reference) => {
  const transfer = await prisma.transfer.findFirst({
    where: { reference },
  });
  return transfer;
};

// Get all Transfers
const getAllTransfers = async ({
  startDate,
  endDate,
  page,
  limit,
  search,
} = {}) => {
  const whereClause = {};
  const threeMonthsAgo = subMonths(new Date(), 12); // Default time range

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Build the date filter
  if (startDateObj && endDateObj) {
    whereClause.movementDate = {
      gte: startDateObj,
      lte: endDateObj,
    };
  } else if (startDateObj) {
    whereClause.movementDate = {
      gte: startDateObj,
      lte: new Date(),
    };
  } else if (endDateObj) {
    whereClause.movementDate = {
      gte: threeMonthsAgo,
      lte: endDateObj,
    };
  } else {
    whereClause.movementDate = {
      gte: threeMonthsAgo,
    };
  }

  // Search by reference or source/destination name (MySQL collation is case-insensitive)
  const term = typeof search === 'string' ? search.trim() : '';
  if (term) {
    const nameMatch = { name: { contains: term } };
    whereClause.OR = [
      { reference: { contains: term } },
      { sourceStore: nameMatch },
      { sourceShop: nameMatch },
      { destStore: nameMatch },
      { destShop: nameMatch },
    ];
    const status = term.toUpperCase();
    if (['PENDING', 'COMPLETED', 'CANCELLED'].includes(status)) {
      whereClause.OR.push({ status });
    }
  }

  // Paginate only when the client asks for it, so older callers still get everything
  const pageNum = Math.max(parseInt(page, 10) || 0, 0);
  const take = Math.min(Math.max(parseInt(limit, 10) || 0, 0), 100);
  const paginate = pageNum > 0 && take > 0;

  const [transfers, count] = await Promise.all([
    prisma.transfer.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc',
      },
      ...(paginate ? { skip: (pageNum - 1) * take, take } : {}),
      include: {
        sourceStore: { select: LOCATION_SUMMARY },
        sourceShop: { select: LOCATION_SUMMARY },
        destStore: { select: LOCATION_SUMMARY },
        destShop: { select: LOCATION_SUMMARY },
        createdBy: { select: USER_SUMMARY },
        updatedBy: { select: USER_SUMMARY },
        _count: {
          select: { items: true },
        },
      },
    }),
    prisma.transfer.count({ where: whereClause }),
  ]);

  return {
    success: true,
    transfers,
    count,
  };
};

// Create Transfer
const generateShortCode = async () => {
  const prefix = 'TRF';
  const year = new Date().getFullYear().toString().slice(-2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');

  // Find the latest transfer for this month/year to get the sequence number
  const latestTransfer = await prisma.transfer.findFirst({
    where: {
      shortCode: {
        startsWith: `${prefix}${year}${month}`,
      },
    },
    orderBy: {
      shortCode: 'desc',
    },
    select: {
      shortCode: true,
    },
  });

  let sequence = 1;
  if (latestTransfer && latestTransfer.shortCode) {
    const lastCode = latestTransfer.shortCode;
    const lastSequence = parseInt(lastCode.slice(-4), 10);
    if (!Number.isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  const sequenceStr = sequence.toString().padStart(4, '0');
  return `${prefix}${year}${month}${sequenceStr}`;
};

const createTransfer = async (transferBody, userId) => {
  // Generate short code first
  const shortCode = await generateShortCode();

  // Check if reference already exists
  if (transferBody.reference) {
    const existingRefTransfer = await getTransferByReference(
      transferBody.reference,
    );

    if (existingRefTransfer) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Transfer reference already taken',
      );
    }
  }

  // Parse items if it's a string
  const { items: itemsString, ...restTransferBody } = transferBody;

  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items
  if (!items) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Transfer must have at least one item',
    );
  }

  if (!Array.isArray(items)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Transfer must have at least one item',
    );
  }

  if (items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Transfer must have at least one item',
    );
  }

  assertNoDuplicateLines(items, 'Transfer');

  // Validate individual item properties
  items.forEach((item, index) => {
    // UPDATED VALIDATION: productId is always required
    // subProductId is optional, but if provided, it must be a valid subproduct of the product
    if (!item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: productId is required`,
      );
    }

    if (!item.batchId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing required field (batchId)`,
      );
    }

    if (item.quantity <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }
  });

  // Get all product IDs and subproduct IDs to fetch their unit of measures
  const productIds = items.map((item) => item.productId);
  const subProductIds = items
    .filter((item) => item.subProductId)
    .map((item) => item.subProductId);

  // Fetch products
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

  // Fetch subproducts with their parent product's unit of measure
  const subProducts = await prisma.subProduct.findMany({
    where: {
      id: {
        in: subProductIds,
      },
    },
    select: {
      id: true,
      productId: true,
      product: {
        select: {
          unitOfMeasureId: true,
        },
      },
    },
  });

  // Validate that subproducts belong to the correct parent products
  items.forEach((item, index) => {
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

  // Create maps for unit of measures
  const productUnitMap = {};
  const subProductUnitMap = {};

  products.forEach((product) => {
    productUnitMap[product.id] = product.unitOfMeasureId;
  });

  subProducts.forEach((subProduct) => {
    subProductUnitMap[subProduct.id] = subProduct.product.unitOfMeasureId;
  });

  // Check if all products/subproducts were found
  items.forEach((item, index) => {
    if (item.productId && !productUnitMap[item.productId]) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${
          index + 1
        }: Product not found or has no unit of measure defined`,
      );
    }
    if (item.subProductId && !subProductUnitMap[item.subProductId]) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${
          index + 1
        }: Subproduct not found or its parent product has no unit of measure defined`,
      );
    }
  });

  // Clean up empty string values
  const cleanedTransferBody = {
    ...restTransferBody,
    shortCode, // Add the generated short code
    sourceStoreId:
      restTransferBody.sourceStoreId === ''
        ? null
        : restTransferBody.sourceStoreId,
    sourceShopId:
      restTransferBody.sourceShopId === ''
        ? null
        : restTransferBody.sourceShopId,
    destStoreId:
      restTransferBody.destStoreId === '' ? null : restTransferBody.destStoreId,
    destShopId:
      restTransferBody.destShopId === '' ? null : restTransferBody.destShopId,
  };

  // Validate source and destination
  validateTransferEndpoints(cleanedTransferBody);

  // Validate each item's batch belongs to its product/subproduct
  await validateItemBatches(items);

  // Create the transfer

  const transfer = await prisma.transfer.create({
    data: {
      ...cleanedTransferBody,
      createdById: userId,
      items: {
        create: items.map((item) => {
          const itemData = {
            batchId: item.batchId,
            unitOfMeasureId: item.subProductId
              ? subProductUnitMap[item.subProductId] // Use subproduct's unit measure
              : productUnitMap[item.productId], // Use product's unit measure
            quantity: item.quantity,
            productId: item.productId, // Always include productId
          };

          // Add subProductId if provided
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
          unitOfMeasure: true,
          product: true,
          subProduct: true,
          batch: true,
        },
      },
    },
  });

  return transfer;
};

const updateTransfer = async (transferId, transferBody, userId) => {
  // Check if transfer exists
  const existingTransfer = await getTransferById(transferId);

  if (!existingTransfer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  }

  if (existingTransfer.createdById !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only the creator can update this transfer',
    );
  }

  // Cannot update completed or cancelled transfers
  if (existingTransfer.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot update ${existingTransfer.status.toLowerCase()} transfer`,
    );
  }

  // Check if reference already exists (excluding current transfer)
  if (
    transferBody.reference &&
    transferBody.reference !== existingTransfer.reference
  ) {
    const existingRefTransfer = await getTransferByReference(
      transferBody.reference,
    );

    if (existingRefTransfer) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Transfer reference already taken',
      );
    }
  }

  // Parse items if it's a string
  const { items: itemsString, ...restTransferBody } = transferBody;

  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items
  if (!items) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Transfer must have at least one item',
    );
  }

  if (!Array.isArray(items)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Transfer must have at least one item',
    );
  }

  if (items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Transfer must have at least one item',
    );
  }

  assertNoDuplicateLines(items, 'Transfer');

  // Validate individual item properties
  items.forEach((item, index) => {
    // productId is always required
    if (!item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1}: productId is required`,
      );
    }

    if (!item.batchId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing required field (batchId)`,
      );
    }

    if (item.quantity <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }
  });

  // Get all product IDs and subproduct IDs to fetch their unit of measures
  const productIds = items.map((item) => item.productId);
  const subProductIds = items
    .filter((item) => item.subProductId)
    .map((item) => item.subProductId);

  // Fetch products
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

  // Fetch subproducts with their parent product's unit of measure
  const subProducts = await prisma.subProduct.findMany({
    where: {
      id: {
        in: subProductIds,
      },
    },
    select: {
      id: true,
      productId: true,
      product: {
        select: {
          unitOfMeasureId: true,
        },
      },
    },
  });

  // Validate that subproducts belong to the correct parent products
  items.forEach((item, index) => {
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

  // Create maps for unit of measures
  const productUnitMap = {};
  const subProductUnitMap = {};

  products.forEach((product) => {
    productUnitMap[product.id] = product.unitOfMeasureId;
  });

  subProducts.forEach((subProduct) => {
    subProductUnitMap[subProduct.id] = subProduct.product.unitOfMeasureId;
  });

  // Check if all products/subproducts were found
  items.forEach((item, index) => {
    if (item.productId && !productUnitMap[item.productId]) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${
          index + 1
        }: Product not found or has no unit of measure defined`,
      );
    }
    if (item.subProductId && !subProductUnitMap[item.subProductId]) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${
          index + 1
        }: Subproduct not found or its parent product has no unit of measure defined`,
      );
    }
  });

  // Clean up empty string values
  const cleanedTransferBody = {
    ...restTransferBody,
    sourceStoreId:
      restTransferBody.sourceStoreId === ''
        ? null
        : restTransferBody.sourceStoreId,
    sourceShopId:
      restTransferBody.sourceShopId === ''
        ? null
        : restTransferBody.sourceShopId,
    destStoreId:
      restTransferBody.destStoreId === '' ? null : restTransferBody.destStoreId,
    destShopId:
      restTransferBody.destShopId === '' ? null : restTransferBody.destShopId,
  };

  // Validate source and destination (fields not sent keep their current value)
  const endpointValue = (key) =>
    cleanedTransferBody[key] !== undefined
      ? cleanedTransferBody[key]
      : existingTransfer[key];
  validateTransferEndpoints({
    sourceType: endpointValue('sourceType'),
    sourceStoreId: endpointValue('sourceStoreId'),
    sourceShopId: endpointValue('sourceShopId'),
    destinationType: endpointValue('destinationType'),
    destStoreId: endpointValue('destStoreId'),
    destShopId: endpointValue('destShopId'),
  });

  // Validate each item's batch belongs to its product/subproduct
  await validateItemBatches(items);

  // Update the transfer inside a transaction

  const result = await runStockTransaction(async (tx) => {
    // Compare-and-set guard: only a still-PENDING transfer may be edited
    // (protects against a concurrent complete/cancel)
    const guarded = await tx.transfer.updateMany({
      where: { id: transferId, status: 'PENDING' },
      data: { updatedById: userId },
    });
    if (guarded.count !== 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Transfer is not pending');
    }

    // Delete all existing items
    await tx.transferItem.deleteMany({
      where: { transferId },
    });

    // Update transfer with cleaned body and new items
    const transfer = await tx.transfer.update({
      where: { id: transferId },
      data: {
        ...cleanedTransferBody,
        items: {
          create: items.map((item) => {
            const itemData = {
              batchId: item.batchId,
              unitOfMeasureId: item.subProductId
                ? subProductUnitMap[item.subProductId] // Use subproduct's unit measure
                : productUnitMap[item.productId], // Use product's unit measure
              quantity: item.quantity,
              productId: item.productId, // Always include productId
            };

            // Add subProductId if provided
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
            unitOfMeasure: true,
            product: true,
            subProduct: true,
            batch: true,
          },
        },
      },
    });

    return transfer;
  });

  return result;
};

// Delete Transfer
// - PENDING / CANCELLED transfers (no stock moved) are deleted as before.
// - COMPLETED transfers have moved stock: the movements are reversed with
//   compensating ledger rows and the transfer is kept as CANCELLED so the
//   original ledger history (which is never deleted) still points at it.
const deleteTransfer = async (id, userId) => {
  const existingTransfer = await getTransferById(id);
  if (!existingTransfer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  }

  const isCompleted = existingTransfer.status === 'COMPLETED';
  const { shortCode } = existingTransfer;

  const result = await runStockTransaction(async (tx) => {
    if (isCompleted) {
      // Compare-and-set first: only one reversal can ever run
      const flipped = await tx.transfer.updateMany({
        where: { id, status: 'COMPLETED' },
        data: { status: 'CANCELLED', updatedById: userId },
      });
      if (flipped.count !== 1) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Transfer is no longer completed',
        );
      }

      const sourceId = getSideLocationId(
        existingTransfer.sourceType,
        existingTransfer.sourceStoreId,
        existingTransfer.sourceShopId,
      );
      const destId = getSideLocationId(
        existingTransfer.destinationType,
        existingTransfer.destStoreId,
        existingTransfer.destShopId,
      );
      if (!sourceId || !destId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Transfer source or destination is missing; cannot reverse stock',
        );
      }

      const destLabel = describeLocation(
        existingTransfer.destinationType,
        existingTransfer.destinationType === 'STORE'
          ? existingTransfer.destStore
          : existingTransfer.destShop,
        destId,
      );
      const sourceLedgerLocation =
        existingTransfer.sourceType === 'STORE'
          ? { storeId: sourceId }
          : { shopId: sourceId };
      const destLedgerLocation =
        existingTransfer.destinationType === 'STORE'
          ? { storeId: destId }
          : { shopId: destId };

      const items = await tx.transferItem.findMany({
        where: { transferId: id },
      });
      const movementDate = new Date();

      await runSequentially(items, async (item, index) => {
        // Take the goods back out of the destination; refuse if they are gone
        await decrementStockOrThrow(tx, {
          type: existingTransfer.destinationType,
          locationId: destId,
          batchId: item.batchId,
          quantity: item.quantity,
          label: destLabel,
          messagePrefix:
            'Cannot reverse transfer (goods were sold or moved from the destination): ',
        });

        // Return them to the source
        await incrementStock(tx, {
          type: existingTransfer.sourceType,
          locationId: sourceId,
          batchId: item.batchId,
          quantity: item.quantity,
          uomId: item.unitOfMeasureId,
        });

        // Compensating ledger rows (original rows are kept)
        await tx.stockLedger.create({
          data: {
            batchId: item.batchId,
            invoiceNo: `REV-${shortCode}-IN-${index}`,
            ...destLedgerLocation,
            movementType: 'OUT',
            quantity: item.quantity,
            unitOfMeasureId: item.unitOfMeasureId,
            reference: `TRANSFER-REVERSAL-${shortCode}`,
            sourceType: 'TRANSFER',
            sourceId: id,
            userId,
            notes: `Transfer reversal - stock returned to ${existingTransfer.sourceType.toLowerCase()}`,
            movementDate,
          },
        });
        await tx.stockLedger.create({
          data: {
            batchId: item.batchId,
            invoiceNo: `REV-${shortCode}-OUT-${index}`,
            ...sourceLedgerLocation,
            movementType: 'IN',
            quantity: item.quantity,
            unitOfMeasureId: item.unitOfMeasureId,
            reference: `TRANSFER-REVERSAL-${shortCode}`,
            sourceType: 'TRANSFER',
            sourceId: id,
            userId,
            notes: `Transfer reversal - stock returned from ${existingTransfer.destinationType.toLowerCase()}`,
            movementDate,
          },
        });
      });

      // Create log entry
      await tx.log.create({
        data: {
          action: `Reversed stock transactions of completed transfer ${shortCode} and marked it cancelled`,
          userId,
        },
      });

      return {
        message:
          'Transfer stock transactions reversed and transfer marked as cancelled',
        stockReversed: true,
      };
    }

    // A transfer that was reversed earlier still has ledger history under its
    // short code; deleting it would free the short code for reuse and the new
    // transfer's ledger invoice numbers would collide with the old ones.
    const ledgerHistory = await tx.stockLedger.count({
      where: {
        OR: [
          { invoiceNo: { startsWith: `${shortCode}-` } },
          { invoiceNo: { startsWith: `REV-${shortCode}-` } },
          { sourceType: 'TRANSFER', sourceId: id },
        ],
      },
    });
    if (ledgerHistory > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Transfer has stock history and cannot be deleted',
      );
    }

    // Guard against a concurrent completion between the read and the delete
    const guarded = await tx.transfer.updateMany({
      where: { id, status: existingTransfer.status },
      data: { updatedById: userId },
    });
    if (guarded.count !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Transfer status changed, please retry',
      );
    }

    // Delete all transfer items
    await tx.transferItem.deleteMany({
      where: { transferId: id },
    });

    // Delete the transfer
    await tx.transfer.delete({
      where: { id },
    });

    // Create log entry
    await tx.log.create({
      data: {
        action: `Deleted transfer ${shortCode}`,
        userId,
      },
    });

    return {
      message: 'Transfer deleted successfully',
      stockReversed: false,
    };
  });

  return result;
};

// Complete Transfer
const completeTransfer = async (transferId, userId) => {
  const transfer = await getTransferById(transferId);

  if (!transfer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  }

  // Cheap pre-check for a friendly message; the in-transaction flip is the real guard
  if (transfer.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Transfer is already ${transfer.status.toLowerCase()}`,
    );
  }

  const sourceId = getSideLocationId(
    transfer.sourceType,
    transfer.sourceStoreId,
    transfer.sourceShopId,
  );
  const destId = getSideLocationId(
    transfer.destinationType,
    transfer.destStoreId,
    transfer.destShopId,
  );
  if (!sourceId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Transfer source is missing');
  }
  if (!destId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Transfer destination is missing',
    );
  }

  const sourceLabel = describeLocation(
    transfer.sourceType,
    transfer.sourceType === 'STORE'
      ? transfer.sourceStore
      : transfer.sourceShop,
    sourceId,
  );
  const sourceLedgerLocation =
    transfer.sourceType === 'STORE'
      ? { storeId: sourceId }
      : { shopId: sourceId };
  const destLedgerLocation =
    transfer.destinationType === 'STORE'
      ? { storeId: destId }
      : { shopId: destId };
  // Store-sourced OUT rows historically used the short-code reference
  const sourceReference =
    transfer.sourceType === 'STORE'
      ? `TRANSFER-${transfer.shortCode}`
      : transfer.reference || `TRANSFER-${transfer.shortCode}`;
  const destReference = transfer.reference || `TRANSFER-${transfer.shortCode}`;

  const result = await runStockTransaction(async (tx) => {
    // Compare-and-set first: only one completion can ever run
    const flipped = await tx.transfer.updateMany({
      where: { id: transferId, status: 'PENDING' },
      data: { status: 'COMPLETED', updatedById: userId },
    });
    if (flipped.count !== 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Transfer is not pending');
    }

    // Re-read items now that the transfer row is locked
    const items = await tx.transferItem.findMany({ where: { transferId } });
    if (items.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Transfer has no items');
    }

    // Get all unit of measures for the transfer items
    const unitOfMeasureIds = items.map((item) => item.unitOfMeasureId);
    const unitOfMeasures = await tx.unitOfMeasure.findMany({
      where: { id: { in: unitOfMeasureIds } },
    });

    const unitOfMeasureMap = unitOfMeasures.reduce((acc, uom) => {
      acc[uom.id] = uom;
      return acc;
    }, {});

    items.forEach((item) => {
      if (!unitOfMeasureMap[item.unitOfMeasureId]) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Unit of measure not found for item ${item.id}`,
        );
      }
    });

    const movementDate = new Date();

    // Move each item sequentially so the guarded decrement also covers
    // several lines that use the same batch
    await runSequentially(items, async (item, index) => {
      const quantityToUse = item.quantity;

      // Create unique invoice numbers for each ledger entry by appending item index and movement type
      const sourceInvoiceNo = `${transfer.shortCode}-OUT-${index}`;
      const destinationInvoiceNo = `${transfer.shortCode}-IN-${index}`;

      // Remove stock from source (guarded: never goes negative)
      await decrementStockOrThrow(tx, {
        type: transfer.sourceType,
        locationId: sourceId,
        batchId: item.batchId,
        quantity: quantityToUse,
        label: sourceLabel,
      });
      await tx.stockLedger.create({
        data: {
          batchId: item.batchId,
          ...sourceLedgerLocation,
          invoiceNo: sourceInvoiceNo, // Use unique invoice number
          movementType: 'OUT',
          quantity: quantityToUse,
          unitOfMeasureId: item.unitOfMeasureId,
          reference: sourceReference,
          sourceType: 'TRANSFER',
          sourceId: transferId,
          userId,
          notes: `Transfer out to ${transfer.destinationType.toLowerCase()}`,
          movementDate,
        },
      });

      // Add stock to destination
      await incrementStock(tx, {
        type: transfer.destinationType,
        locationId: destId,
        batchId: item.batchId,
        quantity: quantityToUse,
        uomId: item.unitOfMeasureId,
      });
      await tx.stockLedger.create({
        data: {
          batchId: item.batchId,
          ...destLedgerLocation,
          invoiceNo: destinationInvoiceNo, // Use unique invoice number
          movementType: 'IN',
          quantity: quantityToUse,
          unitOfMeasureId: item.unitOfMeasureId,
          reference: destReference,
          sourceType: 'TRANSFER',
          sourceId: transferId,
          userId,
          notes: `Transfer in from ${transfer.sourceType.toLowerCase()}`,
          movementDate,
        },
      });
    });

    const updatedTransfer = await tx.transfer.findUnique({
      where: { id: transferId },
    });

    // Create log entry
    await tx.log.create({
      data: {
        action: `Completed transfer ${transfer.reference || transfer.id} with ${
          items.length
        } items`,
        userId,
      },
    });

    return updatedTransfer;
  });

  return result;
};

const cancelTransfer = async (transferId, userId) => {
  const transfer = await getTransferById(transferId);

  if (!transfer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  }

  // Cheap pre-check for a friendly message; the flip below is the real guard
  if (transfer.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot cancel ${transfer.status.toLowerCase()} transfer`,
    );
  }

  const updatedTransfer = await runStockTransaction(async (tx) => {
    const flipped = await tx.transfer.updateMany({
      where: { id: transferId, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        updatedById: userId,
      },
    });
    if (flipped.count !== 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Transfer is not pending');
    }

    // Create log entry
    await tx.log.create({
      data: {
        action: `Cancelled transfer ${transfer.reference || transfer.id}`,
        userId,
      },
    });

    return tx.transfer.findUnique({ where: { id: transferId } });
  });

  return updatedTransfer;
};

const bulkUpdateAdditionalPrices = async (batchUpdates) => {
  try {
    const results = await runStockTransaction(async (tx) => {
      // Process all additional prices in parallel
      const allResults = await Promise.all(
        batchUpdates.flatMap((item) =>
          item.additionalPrices.map(async (price) => {
            // First try to find if this price already exists
            const existingPrice = await tx.additionalPrice.findFirst({
              where: {
                batchId: item.batchId,
                label: price.label,
              },
            });

            if (existingPrice) {
              // Update existing price
              return tx.additionalPrice.update({
                where: { id: existingPrice.id },
                data: { price: price.price },
              });
            }
            // Create new price
            return tx.additionalPrice.create({
              data: {
                batchId: item.batchId,
                label: price.label,
                price: price.price,
              },
            });
          }),
        ),
      );

      // Fetch updated batches
      const updatedBatches = await tx.productBatch.findMany({
        where: {
          id: { in: batchUpdates.map((b) => b.batchId) },
        },
        include: {
          AdditionalPrice: true,
        },
      });

      return {
        totalProcessed: allResults.length,
        batches: updatedBatches,
      };
    });

    return results;
  } catch (error) {
    throw new Error(`Bulk update failed: ${error.message}`);
  }
};

module.exports = {
  getTransferById,
  getTransferByReference,
  getAllTransfers,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  completeTransfer,
  cancelTransfer,
  bulkUpdateAdditionalPrices,
  getTransferBatchesById,
};
