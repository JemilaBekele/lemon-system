/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
const httpStatus = require('http-status');
const { subMonths } = require('date-fns');

const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');
const { runStockTransaction } = require('../utils/stockTransaction');
const { getAccessibleLocations } = require('../utils/accessibleLocations');

// Get SellStockCorrection by ID
const getSellStockCorrectionById = async (id) => {
  const sellStockCorrection = await prisma.sellStockCorrection.findUnique({
    where: { id },
    include: {
      sell: true,
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          product: true,
          shop: true,
          subProduct: true,

          unitOfMeasure: true,
          batches: {
            include: {
              batch: true,
            },
          },
        },
      },
    },
  });
  return sellStockCorrection;
};
const getSellStockCorrectionfilterId = async (sellId, userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (!sellId) {
      throw new Error('Sell ID is required');
    }

    // First, get the shops the user can see (admins: all shops)
    const locations = await getAccessibleLocations(userId);

    if (!locations) {
      throw new Error('User not found');
    }

    // Get user's shop IDs for permission check
    const userShopIds = locations.shopIds;

    // Get ALL sell stock corrections for this sell ID
    const sellStockCorrections = await prisma.sellStockCorrection.findMany({
      where: { sellId },
      include: {
        sell: true,
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            shop: true,
            subProduct: true,

            unitOfMeasure: true,
            batches: {
              include: {
                batch: true,
              },
            },
          },
        },
      },
    });

    if (!sellStockCorrections || sellStockCorrections.length === 0) {
      return [];
    }

    // If user is admin, return all corrections without filtering
    if (locations.isAdmin) {
      return sellStockCorrections;
    }

    // Filter items within each correction based on user's shop permissions
    const filteredCorrections = sellStockCorrections.map((correction) => {
      const filteredItems = correction.items.filter((item) => {
        // If item has no shop, include it
        if (!item.shopId) {
          return true;
        }

        // Check if user has permission for this shop
        return userShopIds.includes(item.shopId);
      });

      return {
        ...correction,
        items: filteredItems,
      };
    });

    return filteredCorrections;
  } catch (error) {
    throw new Error(`Failed to get sell stock corrections: ${error.message}`);
  }
};

// Get SellStockCorrection by reference
const getSellStockCorrectionByReference = async (reference) => {
  const sellStockCorrection = await prisma.sellStockCorrection.findFirst({
    where: { reference },
  });
  return sellStockCorrection;
};

// Get all SellStockCorrections
const getAllSellStockCorrections = async ({ startDate, endDate } = {}) => {
  const whereClause = {};
  const threeMonthsAgo = subMonths(new Date(), 12); // Default time range

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Build the date filter
  if (startDateObj && endDateObj) {
    whereClause.createdAt = {
      gte: startDateObj,
      lte: endDateObj,
    };
  } else if (startDateObj) {
    whereClause.createdAt = {
      gte: startDateObj,
      lte: new Date(),
    };
  } else if (endDateObj) {
    whereClause.createdAt = {
      gte: threeMonthsAgo,
      lte: endDateObj,
    };
  } else {
    whereClause.createdAt = {
      gte: threeMonthsAgo,
    };
  }

  const sellStockCorrections = await prisma.sellStockCorrection.findMany({
    where: whereClause,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      sell: true,
      _count: {
        select: { items: true },
      },
    },
  });

  return {
    sellStockCorrections,
    count: sellStockCorrections.length,
  };
};

// Get SellStockCorrections by Sell ID
const getSellStockCorrectionsBySellId = async (sellId) => {
  const sellStockCorrections = await prisma.sellStockCorrection.findMany({
    where: {
      sellId,
    },
    include: {
      sell: true,
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },

      items: {
        include: {
          product: true,
          shop: true,
          subProduct: true,

          unitOfMeasure: true,
          batches: {
            include: {
              batch: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  return sellStockCorrections;
};

// Validate a correction line's batches and normalize them to positive quantities.
// The sign lives on the line only: a negative line is a return (stock goes back
// into the shop), a positive line is an extra delivery (stock leaves the shop).
// Batches carry the absolute amount per batch, so a -3 line may send +3 or -3.
// Lines that move shop stock (have a shopId) must name their batches.
const normalizeItemBatches = (item, index) => {
  const hasBatches = Array.isArray(item.batches) && item.batches.length > 0;

  if (!hasBatches) {
    if (item.shopId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${
          index + 1
        } must specify the batches to move stock from/to for its shop`,
      );
    }
    return [];
  }

  const seenBatchIds = new Set();
  const batches = item.batches.map((batch) => {
    const batchQuantity = Math.abs(Number(batch.quantity || 0));
    if (!batch.batchId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has a batch without batchId`,
      );
    }
    if (seenBatchIds.has(batch.batchId)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} lists batch ${batch.batchId} more than once`,
      );
    }
    seenBatchIds.add(batch.batchId);
    if (!Number.isInteger(batchQuantity) || batchQuantity === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} batch ${
          batch.batchId
        } must have a non-zero whole quantity`,
      );
    }
    return { batchId: batch.batchId, quantity: batchQuantity };
  });

  const batchQuantitySum = batches.reduce((sum, b) => sum + b.quantity, 0);
  const itemQuantity = Math.abs(Number(item.quantity));
  if (batchQuantitySum !== itemQuantity) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Item ${
        index + 1
      } batch quantities (${batchQuantitySum}) must match item quantity (${itemQuantity})`,
    );
  }

  return batches;
};

const correctionLedgerReference = (correction) =>
  correction.reference || `SELL-CORRECTION-${correction.id}`;

// Put stock back into a shop batch (creates the row if it does not exist yet).
const incrementShopStock = (
  tx,
  { shopId, batchId, quantity, unitOfMeasureId },
) =>
  tx.shopStock.upsert({
    where: { shopId_batchId: { shopId, batchId } },
    update: { quantity: { increment: quantity } },
    create: {
      shopId,
      batchId,
      quantity,
      unitOfMeasureId,
      status: 'Available',
    },
  });

// Take stock out of a shop batch; never lets the row go negative or be created.
const decrementShopStockGuarded = async (tx, { shopId, batchId, quantity }) => {
  const { count } = await tx.shopStock.updateMany({
    where: { shopId, batchId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (count !== 1) {
    const currentStock = await tx.shopStock.findUnique({
      where: { shopId_batchId: { shopId, batchId } },
    });
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient stock for batch ${batchId}. Available: ${
        currentStock ? currentStock.quantity : 0
      }, Required: ${quantity}`,
    );
  }
};

// Every correction line must match a line of the sale (same product,
// sub-product and shop). A return (negative quantity) can't exceed what was
// delivered on that line minus earlier returns (pending or applied), per line
// and per batch, and must use batches that line was delivered from.
const lineKey = (item) =>
  [item.productId, item.subProductId || '', item.shopId || ''].join('|');

const assertCorrectionMatchesSale = async (
  sellId,
  items,
  excludeCorrectionId = null,
) => {
  if (!sellId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'sellId is required');
  }
  const sale = await prisma.sell.findUnique({
    where: { id: sellId },
    select: {
      id: true,
      saleStatus: true,
      items: {
        select: {
          productId: true,
          subProductId: true,
          shopId: true,
          quantity: true,
          itemSaleStatus: true,
          batches: { select: { batchId: true, quantity: true } },
        },
      },
    },
  });
  if (!sale) throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  if (sale.saleStatus === 'CANCELLED') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot correct a cancelled sale',
    );
  }

  const saleLines = new Map();
  sale.items.forEach((line) => {
    const key = lineKey(line);
    const entry = saleLines.get(key) || { delivered: 0, batches: new Map() };
    if (line.itemSaleStatus === 'DELIVERED') {
      entry.delivered += line.quantity;
      line.batches.forEach((b) => {
        entry.batches.set(
          b.batchId,
          (entry.batches.get(b.batchId) || 0) + b.quantity,
        );
      });
    }
    saleLines.set(key, entry);
  });

  // returns already recorded on other corrections of this sale
  const earlier = await prisma.sellStockCorrectionItem.findMany({
    where: {
      quantity: { lt: 0 },
      correction: {
        sellId,
        status: { not: 'REJECTED' },
        ...(excludeCorrectionId && { id: { not: excludeCorrectionId } }),
      },
    },
    select: {
      productId: true,
      subProductId: true,
      shopId: true,
      quantity: true,
      batches: { select: { batchId: true, quantity: true } },
    },
  });
  const returnedByLine = new Map();
  const returnedByBatch = new Map();
  earlier.forEach((item) => {
    const key = lineKey(item);
    returnedByLine.set(
      key,
      (returnedByLine.get(key) || 0) + Math.abs(item.quantity),
    );
    item.batches.forEach((b) => {
      const bKey = `${key}#${b.batchId}`;
      returnedByBatch.set(
        bKey,
        (returnedByBatch.get(bKey) || 0) + Math.abs(b.quantity),
      );
    });
  });

  items.forEach((item, index) => {
    const key = lineKey(item);
    const line = saleLines.get(key);
    const label = `Item ${index + 1}`;
    if (!line) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${label}: this product / sub-product / shop is not on the sale`,
      );
    }
    if (Number(item.quantity) >= 0) return;

    const returning = Math.abs(Number(item.quantity));
    const returnable = line.delivered - (returnedByLine.get(key) || 0);
    if (returning > returnable) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${label}: cannot return ${returning}; only ${Math.max(
          returnable,
          0,
        )} delivered and not yet returned`,
      );
    }
    (item.batches || []).forEach((batch) => {
      const sold = line.batches.get(batch.batchId);
      if (sold === undefined) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${label}: batch ${batch.batchId} was not delivered on this sale line`,
        );
      }
      const bKey = `${key}#${batch.batchId}`;
      const batchReturnable = sold - (returnedByBatch.get(bKey) || 0);
      if (Math.abs(Number(batch.quantity)) > batchReturnable) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${label}: cannot return ${Math.abs(
            Number(batch.quantity),
          )} from that batch; only ${Math.max(
            batchReturnable,
            0,
          )} left to return`,
        );
      }
    });
  });
};

// Only these header fields come from the client; status and totals never do
const pickCorrectionHeader = (body) => ({
  sellId: body.sellId === '' ? null : body.sellId,
  reference: body.reference,
  notes: body.notes,
});

const createSellStockCorrection = async (sellStockCorrectionBody, userId) => {
  const { items: itemsString, ...restSellStockCorrectionBody } =
    sellStockCorrectionBody;
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items array exists
  if (!items || !Array.isArray(items)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Sell stock correction must have items array',
    );
  }

  // Filter out items with zero quantity
  const nonZeroItems = items.filter((item) => Number(item.quantity) !== 0);

  // Check if there are any items left after filtering
  if (nonZeroItems.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Sell stock correction must have at least one item with non-zero quantity',
    );
  }

  // Validate individual item properties and calculate totals
  let totalCorrectionAmount = 0;
  const itemsWithCalculations = nonZeroItems.map((item, index) => {
    if (!item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing required field (productId)`,
      );
    }
    if (!item.unitOfMeasureId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing required field (unitOfMeasureId)`,
      );
    }
    if (
      item.quantity === undefined ||
      item.quantity === null ||
      Number.isNaN(Number(item.quantity))
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }

    if (!item.unitPrice || item.unitPrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} must have a valid unit price`,
      );
    }

    // Validate batches (required for shop items) and normalize to positive
    const batches = normalizeItemBatches(item, index);

    // Calculate total price for the item
    const totalPrice = item.unitPrice * Math.abs(item.quantity);
    totalCorrectionAmount += item.quantity >= 0 ? totalPrice : -totalPrice;

    return {
      ...item,
      batches,
      totalPrice,
    };
  });

  const cleanedSellStockCorrectionBody = pickCorrectionHeader(
    restSellStockCorrectionBody,
  );
  await assertCorrectionMatchesSale(
    cleanedSellStockCorrectionBody.sellId,
    itemsWithCalculations,
  );

  // Create the sell stock correction
  const sellStockCorrection = await prisma.sellStockCorrection.create({
    data: {
      ...cleanedSellStockCorrectionBody,
      total: totalCorrectionAmount,
      createdById: userId,
      updatedById: userId,
      items: {
        create: itemsWithCalculations.map((item) => ({
          productId: item.productId,
          // Add subproduct support
          subProductId: item.subProductId || null,
          shopId: item.shopId || null,
          unitOfMeasureId: item.unitOfMeasureId,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          quantity: item.quantity,
          batches:
            item.batches && item.batches.length > 0
              ? {
                  create: item.batches.map((batch) => ({
                    batchId: batch.batchId,
                    quantity: batch.quantity,
                  })),
                }
              : undefined,
        })),
      },
    },
    include: {
      items: {
        include: {
          product: true,
          // Include subproduct in the response
          subProduct: true,
          unitOfMeasure: true,
          shop: true,
          batches: {
            include: {
              batch: true,
            },
          },
        },
      },
    },
  });

  return sellStockCorrection;
};

// Update SellStockCorrection
const updateSellStockCorrection = async (
  sellStockCorrectionId,
  sellStockCorrectionBody,
  userId,
) => {
  // Check if sell stock correction exists
  const existingSellStockCorrection = await getSellStockCorrectionById(
    sellStockCorrectionId,
  );
  if (!existingSellStockCorrection) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sell stock correction not found');
  }

  // Cannot update approved or rejected sell stock corrections
  if (existingSellStockCorrection.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot update ${existingSellStockCorrection.status.toLowerCase()} sell stock correction`,
    );
  }

  // Check if reference already exists (excluding current sell stock correction)
  if (
    sellStockCorrectionBody.reference &&
    sellStockCorrectionBody.reference !== existingSellStockCorrection.reference
  ) {
    if (
      await getSellStockCorrectionByReference(sellStockCorrectionBody.reference)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Sell stock correction reference already taken',
      );
    }
  }

  // Parse items if it's a string
  const { items: itemsString, ...restSellStockCorrectionBody } =
    sellStockCorrectionBody;
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Sell stock correction must have at least one item',
    );
  }

  // Validate individual item properties and calculate totals
  let totalCorrectionAmount = 0;
  const itemsWithCalculations = items.map((item, index) => {
    if (!item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing required field (productId)`,
      );
    }
    if (!item.unitOfMeasureId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing required field (unitOfMeasureId)`,
      );
    }
    if (
      item.quantity === undefined ||
      item.quantity === null ||
      Number.isNaN(Number(item.quantity))
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }
    if (Number(item.quantity) === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} quantity cannot be zero`,
      );
    }
    if (!item.unitPrice || item.unitPrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} must have a valid unit price`,
      );
    }

    // Validate batches (required for shop items) and normalize to positive
    const batches = normalizeItemBatches(item, index);

    // Calculate total price for the item
    const totalPrice = item.unitPrice * Math.abs(item.quantity);
    totalCorrectionAmount += item.quantity >= 0 ? totalPrice : -totalPrice;

    return {
      ...item,
      batches,
      totalPrice,
    };
  });

  // Clean up empty string values
  const cleanedSellStockCorrectionBody = {
    ...pickCorrectionHeader({
      ...restSellStockCorrectionBody,
      sellId:
        restSellStockCorrectionBody.sellId ??
        existingSellStockCorrection.sellId,
    }),
  };
  await assertCorrectionMatchesSale(
    cleanedSellStockCorrectionBody.sellId,
    itemsWithCalculations,
    sellStockCorrectionId,
  );

  // Update the sell stock correction inside a transaction
  const result = await runStockTransaction(async (tx) => {
    // Compare-and-set: only a still-PENDING correction may be edited
    const { count: lockedCount } = await tx.sellStockCorrection.updateMany({
      where: { id: sellStockCorrectionId, status: 'PENDING' },
      data: { updatedById: userId },
    });
    if (lockedCount !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Only pending sell stock corrections can be updated',
      );
    }

    // Delete all existing batches first
    await tx.sellStockCorrectionBatch.deleteMany({
      where: {
        correctionItem: {
          correctionId: sellStockCorrectionId,
        },
      },
    });

    // Delete all existing items
    await tx.sellStockCorrectionItem.deleteMany({
      where: { correctionId: sellStockCorrectionId },
    });

    // Update sell stock correction with cleaned body and new items
    const sellStockCorrection = await tx.sellStockCorrection.update({
      where: { id: sellStockCorrectionId },
      data: {
        ...cleanedSellStockCorrectionBody,
        total: totalCorrectionAmount,
        updatedById: userId,
        items: {
          create: itemsWithCalculations.map((item) => ({
            productId: item.productId,
            // Add subproduct support
            subProductId: item.subProductId || null,
            shopId: item.shopId || null,
            unitOfMeasureId: item.unitOfMeasureId,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            quantity: item.quantity,
            batches:
              item.batches && item.batches.length > 0
                ? {
                    create: item.batches.map((batch) => ({
                      batchId: batch.batchId,
                      quantity: batch.quantity,
                    })),
                  }
                : undefined,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: true,
            // Include subproduct in the response
            subProduct: true,
            unitOfMeasure: true,
            shop: true,
            batches: {
              include: {
                batch: true,
              },
            },
          },
        },
      },
    });

    return sellStockCorrection;
  });

  return result;
};

const approveSellStockCorrection = async (
  sellStockCorrectionId,
  userId,
  deliveredItemIds = [],
) => {
  const sellStockCorrection = await getSellStockCorrectionById(
    sellStockCorrectionId,
  );

  if (!sellStockCorrection) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sell stock correction not found');
  }

  if (!['PENDING', 'PARTIAL'].includes(sellStockCorrection.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Sell stock correction is already ${sellStockCorrection.status.toLowerCase()}`,
    );
  }

  const requestedIds = new Set(
    Array.isArray(deliveredItemIds) ? deliveredItemIds : [],
  );

  const result = await runStockTransaction(async (tx) => {
    // Compare-and-set on the correction first: locks the row for this
    // transaction and rejects APPROVED/REJECTED (or a concurrent change)
    const { count: lockedCount } = await tx.sellStockCorrection.updateMany({
      where: {
        id: sellStockCorrectionId,
        status: { in: ['PENDING', 'PARTIAL'] },
      },
      data: { updatedById: userId },
    });
    if (lockedCount !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Sell stock correction is no longer pending',
      );
    }

    const correction = await tx.sellStockCorrection.findUnique({
      where: { id: sellStockCorrectionId },
      include: {
        items: {
          include: {
            batches: true,
            unitOfMeasure: true,
          },
        },
      },
    });

    if (!correction) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Sell stock correction not found after update',
      );
    }

    // Only items named in this request that are still PENDING get applied.
    // Items already DELIVERED by an earlier (partial) approval are skipped so
    // their stock and NetTotal effect is never applied twice.
    const itemsToApply = correction.items.filter(
      (item) => requestedIds.has(item.id) && item.itemSaleStatus === 'PENDING',
    );

    // Associated sell (if any) must exist before we adjust it
    let sell = null;
    if (correction.sellId) {
      sell = await tx.sell.findUnique({
        where: { id: correction.sellId },
        select: { id: true, NetTotal: true },
      });
      if (!sell) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Associated sell not found');
      }
    }

    const reference = correctionLedgerReference(correction);
    let netTotalAdjustment = 0;

    for (const item of itemsToApply) {
      // Per-item compare-and-set: PENDING -> DELIVERED, before moving stock
      const { count: itemCount } = await tx.sellStockCorrectionItem.updateMany({
        where: {
          id: item.id,
          correctionId: sellStockCorrectionId,
          itemSaleStatus: 'PENDING',
        },
        data: {
          itemSaleStatus: 'DELIVERED',
          updatedAt: new Date(),
        },
      });
      if (itemCount !== 1) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Sell stock correction item ${item.id} was already processed`,
        );
      }

      if (!item.unitOfMeasure) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Unit of measure not found for item ${item.id}`,
        );
      }

      // Negative quantity = return: customer pays less, stock comes back IN.
      // Positive quantity = extra delivery: customer pays more, stock goes OUT.
      netTotalAdjustment += item.quantity * item.unitPrice;

      if (item.shopId) {
        if (!item.batches || item.batches.length === 0) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Item ${item.id} has no batches; batches are required to move shop stock`,
          );
        }

        const isReturn = item.quantity < 0;
        const notes = isReturn
          ? `Sell stock addition: ${correction.notes || 'correction'}`
          : `Sell stock subtraction: ${correction.notes || 'correction'}`;

        for (const correctionBatch of item.batches) {
          const batchQuantity = Math.abs(correctionBatch.quantity);
          const { batchId } = correctionBatch;

          if (batchQuantity > 0) {
            if (isReturn) {
              await incrementShopStock(tx, {
                shopId: item.shopId,
                batchId,
                quantity: batchQuantity,
                unitOfMeasureId: item.unitOfMeasureId,
              });
            } else {
              await decrementShopStockGuarded(tx, {
                shopId: item.shopId,
                batchId,
                quantity: batchQuantity,
              });
            }

            await tx.stockLedger.create({
              data: {
                batchId,
                shopId: item.shopId,
                movementType: isReturn ? 'IN' : 'OUT',
                quantity: batchQuantity,
                unitOfMeasureId: item.unitOfMeasureId,
                reference,
                sourceType: 'SELL_CORRECTION',
                sourceId: sellStockCorrectionId,
                userId,
                notes: `${notes} (Batch: ${batchId})`,
                movementDate: new Date(),
              },
            });
          }
        }
      }
    }

    // Atomic NetTotal adjustment for the items applied in THIS call only
    let updatedSell = sell;
    if (sell && netTotalAdjustment !== 0) {
      updatedSell = await tx.sell.update({
        where: { id: sell.id },
        data: {
          NetTotal: { increment: netTotalAdjustment },
          updatedById: userId,
          updatedAt: new Date(),
        },
        select: { id: true, NetTotal: true },
      });
    }

    // Determine the final status based on delivered items (after this call)
    const appliedIds = new Set(itemsToApply.map((item) => item.id));
    const allItemsCount = correction.items.length;
    const deliveredItemsCount = correction.items.filter(
      (item) => item.itemSaleStatus === 'DELIVERED' || appliedIds.has(item.id),
    ).length;

    let finalStatus = 'APPROVED';
    if (deliveredItemsCount === 0) {
      finalStatus = 'PENDING';
    } else if (deliveredItemsCount < allItemsCount) {
      finalStatus = 'PARTIAL';
    }

    const finalSellStockCorrection = await tx.sellStockCorrection.update({
      where: { id: sellStockCorrectionId },
      data: {
        status: finalStatus,
        updatedById: userId,
        updatedAt: new Date(),
      },
      include: {
        items: {
          select: {
            id: true,
            itemSaleStatus: true,
            productId: true,
            quantity: true,
          },
        },
      },
    });

    // Create log entry
    const deliveredItemsText =
      itemsToApply.length > 0
        ? `Marked ${itemsToApply.length} items as delivered`
        : 'No items marked as delivered';

    await tx.log.create({
      data: {
        action: `Updated sell stock correction ${
          correction.reference || correction.id
        }. Status: ${finalStatus}. ${deliveredItemsText}. ${
          sell && netTotalAdjustment !== 0
            ? `Net total adjusted by ${netTotalAdjustment}`
            : 'No net total adjustment'
        }`,
        userId,
      },
    });

    return {
      ...finalSellStockCorrection,
      netTotalAdjustment,
      previousNetTotal: sell ? sell.NetTotal : null,
      newNetTotal: updatedSell ? updatedSell.NetTotal : null,
      deliveredItemsCount,
      totalItemsCount: allItemsCount,
    };
  });

  return result;
};
const deleteSellStockCorrection = async (id, userId) => {
  const existingSellStockCorrection = await getSellStockCorrectionById(id);
  if (!existingSellStockCorrection) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sell stock correction not found');
  }

  return runStockTransaction(async (tx) => {
    // Lock the correction row first so a concurrent approve/delete waits.
    // Must be the first statement so the reads below see committed data.
    const lockedRows = await tx.$queryRaw`
      SELECT _id FROM sell_stock_corrections WHERE _id = ${id} FOR UPDATE
    `;
    if (lockedRows.length !== 1) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Sell stock correction not found',
      );
    }

    const correction = await tx.sellStockCorrection.findUnique({
      where: { id },
      select: { id: true, sellId: true, reference: true, status: true },
    });

    // Get all sell stock correction items with their batches for reversal
    const correctionItemsWithBatches =
      await tx.sellStockCorrectionItem.findMany({
        where: { correctionId: id },
        include: {
          batches: true,
        },
      });

    // Every item that was applied (DELIVERED) gets reversed, whether the
    // correction is APPROVED or only PARTIAL
    const appliedItems = correctionItemsWithBatches.filter(
      (item) => item.itemSaleStatus === 'DELIVERED',
    );

    let netTotalAdjustment = 0;
    let totalBatchesReversed = 0;
    const reversalReference = `SELL-CORRECTION-REVERSAL-${id}`;

    for (const item of appliedItems) {
      const isReturn = item.quantity < 0;

      // Exact inverse of the approval adjustment (quantity x unitPrice)
      netTotalAdjustment -= item.quantity * item.unitPrice;

      if (item.shopId && item.batches && item.batches.length > 0) {
        for (const correctionBatch of item.batches) {
          const batchQuantity = Math.abs(correctionBatch.quantity);
          const { batchId } = correctionBatch;

          if (batchQuantity > 0) {
            if (isReturn) {
              // The return put stock back; take it out again (guarded)
              await decrementShopStockGuarded(tx, {
                shopId: item.shopId,
                batchId,
                quantity: batchQuantity,
              });
            } else {
              // The extra delivery took stock out; put it back
              await incrementShopStock(tx, {
                shopId: item.shopId,
                batchId,
                quantity: batchQuantity,
                unitOfMeasureId: item.unitOfMeasureId,
              });
            }

            // Compensating ledger row (original rows are kept)
            await tx.stockLedger.create({
              data: {
                batchId,
                shopId: item.shopId,
                movementType: isReturn ? 'OUT' : 'IN',
                quantity: batchQuantity,
                unitOfMeasureId: item.unitOfMeasureId,
                reference: reversalReference,
                sourceType: 'SELL_CORRECTION',
                sourceId: id,
                userId,
                notes: `Sell stock correction reversal - ${
                  isReturn
                    ? 'Removing returned stock'
                    : 'Adding back subtracted stock'
                } for Item: ${item.id} (Batch: ${batchId})`,
                movementDate: new Date(),
              },
            });
            totalBatchesReversed += 1;
          }
        }
      }
    }

    // Reverse net total adjustment atomically if there's an associated sell
    if (correction.sellId && netTotalAdjustment !== 0) {
      const { count: sellCount } = await tx.sell.updateMany({
        where: { id: correction.sellId },
        data: {
          NetTotal: { increment: netTotalAdjustment },
          updatedById: userId,
          updatedAt: new Date(),
        },
      });
      if (sellCount !== 1) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Associated sell not found');
      }
    }

    // Delete all sell stock correction batches first
    await tx.sellStockCorrectionBatch.deleteMany({
      where: {
        correctionItem: {
          correctionId: id,
        },
      },
    });

    // Delete all sell stock correction items
    await tx.sellStockCorrectionItem.deleteMany({
      where: { correctionId: id },
    });

    // Delete the sell stock correction
    await tx.sellStockCorrection.delete({
      where: { id },
    });

    // Create log entry with reversal details
    const reversalPerformed = appliedItems.length > 0;
    let logMessage = `Sell stock correction ${
      correction.reference || id
    } deleted`;

    if (reversalPerformed) {
      logMessage += ` - Stock reversal completed: ${appliedItems.length} items, ${totalBatchesReversed} batches`;

      if (netTotalAdjustment !== 0) {
        logMessage += `, Net total adjusted by ${netTotalAdjustment}`;
      }
    } else {
      logMessage += ` (status: ${correction.status})`;
    }

    await tx.log.create({
      data: {
        action: logMessage,
        userId,
      },
    });

    return {
      message: `Sell stock correction deleted successfully${
        reversalPerformed ? ' with stock reversal' : ''
      }`,
      reversalPerformed,
      netTotalAdjustment: reversalPerformed ? netTotalAdjustment : 0,
    };
  });
};
// Reject SellStockCorrection
const rejectSellStockCorrection = async (sellStockCorrectionId, userId) => {
  const sellStockCorrection = await getSellStockCorrectionById(
    sellStockCorrectionId,
  );

  if (!sellStockCorrection) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sell stock correction not found');
  }

  if (sellStockCorrection.status !== 'PENDING') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot reject ${sellStockCorrection.status.toLowerCase()} sell stock correction`,
    );
  }

  // Compare-and-set so a concurrent approval cannot be overwritten
  const { count: rejectedCount } = await prisma.sellStockCorrection.updateMany({
    where: { id: sellStockCorrectionId, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      updatedById: userId,
    },
  });
  if (rejectedCount !== 1) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only pending sell stock corrections can be rejected',
    );
  }
  const updatedSellStockCorrection =
    await prisma.sellStockCorrection.findUnique({
      where: { id: sellStockCorrectionId },
    });

  // Create log entry
  await prisma.log.create({
    data: {
      action: `Rejected sell stock correction ${
        sellStockCorrection.reference || sellStockCorrection.id
      }`,
      userId,
    },
  });

  return updatedSellStockCorrection;
};
const getSellByIdforsellcorrection = async (id) => {
  const sell = await prisma.sell.findUnique({
    where: { id },
    include: {
      branch: true,
      customer: true,
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          product: {
            include: {
              unitOfMeasure: true,
              category: true,
            },
          },
          subProduct: true,
          shop: true,
          unitOfMeasure: true,
          batches: {
            include: {
              batch: {
                include: {
                  product: {
                    include: {
                      unitOfMeasure: true,
                      category: true,
                      subCategory: true,
                    },
                  },
                  store: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!sell) {
    return null;
  }

  // Collect all batch IDs and shop IDs to query shop stock in one go
  const batchIds = [];
  const shopBatchPairs = [];

  sell.items.forEach((item) => {
    item.batches.forEach((sellBatch) => {
      batchIds.push(sellBatch.batchId);
      shopBatchPairs.push({
        batchId: sellBatch.batchId,
        shopId: item.shopId,
      });
    });
  });

  // Get all relevant shop stock records in one query
  const shopStocks = await prisma.shopStock.findMany({
    where: {
      OR: shopBatchPairs.map((pair) => ({
        batchId: pair.batchId,
        shopId: pair.shopId,
        status: 'Available',
      })),
    },
    include: {
      unitOfMeasure: true,
      shop: true,
    },
  });

  // Create a map for quick lookup: { `${batchId}-${shopId}`: shopStock }
  const shopStockMap = new Map();
  shopStocks.forEach((stock) => {
    const key = `${stock.batchId}-${stock.shopId}`;
    shopStockMap.set(key, stock);
  });

  // Enhance items with batch availability
  const enhancedItems = sell.items.map((item) => {
    const batchesWithAvailability = item.batches.map((sellBatch) => {
      const key = `${sellBatch.batchId}-${item.shopId}`;
      const shopStock = shopStockMap.get(key);

      return {
        ...sellBatch,
        batch: {
          ...sellBatch.batch,
          availableQuantity: shopStock ? shopStock.quantity : 0,
          availableShopStock: shopStock || null,
        },
      };
    });

    return {
      ...item,
      batches: batchesWithAvailability,
    };
  });

  return {
    ...sell,
    items: enhancedItems,
  };
};
const markAsCheckedSellStockCorrection = async (
  sellStockCorrectionId,
  userId,
) => {
  const sellStockCorrection = await getSellStockCorrectionById(
    sellStockCorrectionId,
  );

  if (!sellStockCorrection) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sell stock correction not found');
  }

  // Optional: Add validation based on your business logic
  // For example, you might want to ensure it's only checked when in a specific status
  if (sellStockCorrection.isChecked) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Sell stock correction is already checked',
    );
  }

  const updatedSellStockCorrection = await prisma.sellStockCorrection.update({
    where: { id: sellStockCorrectionId },
    data: {
      isChecked: true,
    },
  });

  // Create log entry
  await prisma.log.create({
    data: {
      action: `Marked sell stock correction ${
        sellStockCorrection.reference || sellStockCorrection.id
      } as checked`,
      userId,
    },
  });

  return updatedSellStockCorrection;
};
module.exports = {
  getSellStockCorrectionById,
  getSellStockCorrectionByReference,
  getAllSellStockCorrections,
  getSellStockCorrectionsBySellId,
  createSellStockCorrection,
  updateSellStockCorrection,
  deleteSellStockCorrection,
  approveSellStockCorrection,
  rejectSellStockCorrection,
  getSellByIdforsellcorrection,
  getSellStockCorrectionfilterId,
  markAsCheckedSellStockCorrection,
};
