const httpStatus = require('http-status');
const { subMonths } = require('date-fns');

const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');
const { runStockTransaction } = require('../utils/stockTransaction');

const getProductBatchById = async (batchId) => {
  if (!batchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Batch ID is required');
  }

  const productBatch = await prisma.productBatch.findUnique({
    where: { id: batchId },
    include: {
      product: {},
      StockLedger: {
        orderBy: {
          movementDate: 'desc',
        },
        take: 10,
      },
      StoreStock: true,
      ShopStock: { select: { quantity: true } },
    },
  });

  if (!productBatch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product batch not found');
  }

  // Batches no longer store a stock figure: report the on-hand total
  // across every store and shop instead
  const { ShopStock: shopStocks, ...batch } = productBatch;
  const stock =
    batch.StoreStock.reduce((sum, s) => sum + s.quantity, 0) +
    shopStocks.reduce((sum, s) => sum + s.quantity, 0);

  return { ...batch, stock };
};

const getAllProductBatches = async ({ startDate, endDate } = {}) => {
  const whereClause = {};
  const twelveMonthsAgo = subMonths(new Date(), 12); // Default to last 12 months

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Filter by createdAt (batch creation date)
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
      gte: twelveMonthsAgo,
      lte: endDateObj,
    };
  } else {
    whereClause.createdAt = {
      gte: twelveMonthsAgo,
    };
  }

  const productBatches = await prisma.productBatch.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      product: {
        select: {
          name: true,
          productCode: true,
        },
      },
      store: {
        select: {
          name: true,
        },
      },
      StoreStock: true,
      ShopStock: true,
    },
  });

  return {
    productBatches,
    count: productBatches.length,
  };
};
const getProductBatches = async (productId, shopId) => {
  const productBatches = await prisma.productBatch.findMany({
    where: {
      productId,
      ShopStock: {
        some: {
          shopId,
          quantity: {
            gt: 0, // Stock not zero
          },
          status: 'Available', // Only available stock
          batch: {
            expiryDate: {
              gt: new Date(), // Not expired (expiry date greater than current date)
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      product: {
        select: {
          name: true,
          productCode: true,
          unitOfMeasure: true,
          sellPrice: true,
        },
      },
      ShopStock: {
        where: {
          shopId,
          quantity: { gt: 0 },
          status: 'Available',
        },
        include: {
          unitOfMeasure: true,
        },
      },
    },
  });

  return {
    productBatches,
    count: productBatches.length,
  };
};

const deleteProductBatch = async (batchId, userId) => {
  if (!batchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Batch ID is required');
  }

  return runStockTransaction(async (tx) => {
    const existingBatch = await tx.productBatch.findUnique({
      where: { id: batchId },
      include: {
        StoreStock: { select: { quantity: true } },
        ShopStock: { select: { quantity: true } },
        _count: {
          select: {
            StockLedger: true,
            PurchaseItem: true,
            TransferItem: true,
            StockCorrectionItem: true,
            SellItemBatch: true,
            SellStockCorrectionBatch: true,
          },
        },
      },
    });

    if (!existingBatch) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product batch not found');
    }

    // Refuse while any location still holds stock from this batch
    const hasStock =
      existingBatch.StoreStock.some((s) => s.quantity > 0) ||
      existingBatch.ShopStock.some((s) => s.quantity > 0);
    if (hasStock) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot delete batch that still has stock in a store or shop',
      );
    }

    // Refuse when the batch appears in any stock history
    const { _count: counts } = existingBatch;
    const hasHistory = Object.values(counts).some((count) => count > 0);
    if (hasHistory) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot delete batch with existing stock transactions',
      );
    }

    // Remove empty stock rows, then the batch itself
    await tx.storeStock.deleteMany({ where: { batchId } });
    await tx.shopStock.deleteMany({ where: { batchId } });

    const deletedBatch = await tx.productBatch.delete({
      where: { id: batchId },
    });

    await tx.log.create({
      data: {
        action: `Deleted product batch ${deletedBatch.batchNumber}`,
        userId,
      },
    });

    return deletedBatch;
  });
};
const getProductBatchByBatchNumber = async (batchNumber) => {
  const batch = await prisma.productBatch.findFirst({
    where: {
      batchNumber,
    },
  });
  return !!batch;
};

// Parse an optional batch price; undefined when not supplied
const parseBatchPrice = (price) => {
  if (price === undefined || price === null || price === '') {
    return undefined;
  }
  const parsed = parseFloat(price);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid batch price');
  }
  return parsed;
};

// Parse an optional expiry date; undefined when not supplied
const parseExpiryDate = (expiryDate) => {
  if (!expiryDate) {
    return undefined;
  }
  const date = new Date(expiryDate);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid expiry date');
  }
  return date.toISOString();
};

// This endpoint only registers the batch: it does not book StoreStock or a
// ledger row, so the batch always starts with stock 0. Opening stock goes
// through POST /api/products/:productId/batches (or a purchase).
const createProductBatchWithAdditionalPrices = async (productBatchBody) => {
  const { productId, subProductId, batchNumber, expiryDate, price, storeId } =
    productBatchBody || {};

  if (!batchNumber) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Batch number is required');
  }

  // Check if product batch with same batch number already exists
  if (await getProductBatchByBatchNumber(batchNumber)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Batch number already exists');
  }

  const product = productId
    ? await prisma.product.findUnique({ where: { id: productId } })
    : null;

  if (!product) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Product does not exist');
  }

  if (subProductId) {
    const subProduct = await prisma.subProduct.findFirst({
      where: { id: subProductId, productId },
      select: { id: true },
    });
    if (!subProduct) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Sub-product does not belong to this product',
      );
    }
  }

  const productBatch = await prisma.productBatch.create({
    data: {
      productId,
      subProductId: subProductId || null,
      batchNumber,
      expiryDate: parseExpiryDate(expiryDate),
      price: parseBatchPrice(price),
      storeId: storeId || null,
    },
  });

  return productBatch;
};

// Only descriptive fields can be edited. Stock, product, sub-product and
// store are owned by the stock movements (ledger) and are ignored here.
const updateProductBatchWithAdditionalPrices = async (batchId, updateBody) => {
  // Check if product batch exists
  const existingBatch = await prisma.productBatch.findUnique({
    where: { id: batchId },
  });

  if (!existingBatch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product batch not found');
  }

  const body = updateBody || {};
  const data = {};

  if (body.batchNumber && body.batchNumber !== existingBatch.batchNumber) {
    const duplicate = await prisma.productBatch.findFirst({
      where: { batchNumber: body.batchNumber, id: { not: batchId } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Batch number already exists');
    }
    data.batchNumber = body.batchNumber;
  }

  const expiryDate = parseExpiryDate(body.expiryDate);
  if (expiryDate !== undefined) {
    data.expiryDate = expiryDate;
  }

  const price = parseBatchPrice(body.price);
  if (price !== undefined) {
    data.price = price;
  }

  const updatedBatch = await prisma.productBatch.update({
    where: { id: batchId },
    data,
  });

  return updatedBatch;
};

// Get product by store ID and stock ID
const getProductByStoreStock = async (storeId) => {
  try {
    const storeStocks = await prisma.storeStock.findMany({
      where: {
        storeId,
      },
      include: {
        batch: {
          include: {
            product: {
              include: {
                category: { select: { id: true, name: true } },
                subCategory: { select: { id: true, name: true } },
                unitOfMeasure: true,
              },
            },
            subProduct: true, // Include subproduct
          },
        },
        store: { select: { id: true, name: true, branchId: true } },
        unitOfMeasure: true,
      },
    });

    if (!storeStocks || storeStocks.length === 0) {
      throw new Error(`No store stocks found for storeId: ${storeId}`);
    }

    // Debug each stock to check for missing relations
    const validStocks = storeStocks.filter((stock) => {
      if (!stock.batch) {
        return false;
      }
      if (!stock.batch.product) {
        return false;
      }
      return true;
    });

    // Return enriched data with all necessary information
    const result = validStocks.map((storeStock) => {
      const { product } = storeStock.batch;

      return {
        id: storeStock.id,
        storeId: storeStock.storeId,
        batchId: storeStock.batchId,
        quantity: storeStock.quantity,
        status: storeStock.status,
        createdAt: storeStock.createdAt,
        updatedAt: storeStock.updatedAt,

        // Store information
        store: {
          id: storeStock.store.id,
          name: storeStock.store.name,
          branchId: storeStock.store.branchId,
        },

        // Batch information
        batch: {
          id: storeStock.batch.id,
          batchNumber: storeStock.batch.batchNumber,
          expiryDate: storeStock.batch.expiryDate,
          price: storeStock.batch.price,
          subProduct: storeStock.batch.subProduct, // Include subproduct
        },

        // Product information with all details
        product: {
          id: product.id,
          productCode: product.productCode,
          name: product.name,
          generic: product.generic,
          description: product.description,
          sellPrice: product.sellPrice,
          imageUrl: product.imageUrl,
          isActive: product.isActive,

          // Category and subcategory
          category: product.category,
          subCategory: product.subCategory,

          // Unit of measure information from product
          unitOfMeasure: product.unitOfMeasure,
        },

        // Unit of measure specific to this stock entry
        unitOfMeasure: storeStock.unitOfMeasure,

        // Helper fields for frontend
        availableQuantity: storeStock.quantity,
        conversionFactor: storeStock.unitOfMeasure?.conversionFactor || 1,
      };
    });

    return result;
  } catch (error) {
    console.error('Error in getProductByStoreStock:', error);
    throw error;
  }
};

const getProductByShopStock = async (shopId) => {
  try {
    const shopStocks = await prisma.shopStock.findMany({
      where: {
        shopId,
      },
      include: {
        batch: {
          include: {
            product: {
              include: {
                category: { select: { id: true, name: true } },
                subCategory: { select: { id: true, name: true } },
                unitOfMeasure: true,
              },
            },
            subProduct: true, // Include subproduct
          },
        },
        shop: { select: { id: true, name: true, branchId: true } },
        unitOfMeasure: true,
      },
    });

    if (!shopStocks || shopStocks.length === 0) {
      throw new Error(`No shop stocks found for shopId: ${shopId}`);
    }

    // Debug each stock
    const validStocks = shopStocks.filter((stock) => {
      if (!stock.batch) {
        return false;
      }
      if (!stock.batch.product) {
        return false;
      }
      return true;
    });

    // Return enriched data with all necessary information
    const result = validStocks.map((shopStock) => {
      const { product } = shopStock.batch;

      return {
        id: shopStock.id,
        shopId: shopStock.shopId,
        batchId: shopStock.batchId,
        quantity: shopStock.quantity,
        status: shopStock.status,
        createdAt: shopStock.createdAt,
        updatedAt: shopStock.updatedAt,

        // Shop information
        shop: {
          id: shopStock.shop.id,
          name: shopStock.shop.name,
          branchId: shopStock.shop.branchId,
        },

        // Batch information
        batch: {
          id: shopStock.batch.id,
          batchNumber: shopStock.batch.batchNumber,
          expiryDate: shopStock.batch.expiryDate,
          price: shopStock.batch.price,
          subProduct: shopStock.batch.subProduct, // Include subproduct
        },

        // Product information with all details
        product: {
          id: product.id,
          productCode: product.productCode,
          name: product.name,
          generic: product.generic,
          description: product.description,
          sellPrice: product.sellPrice,
          imageUrl: product.imageUrl,
          isActive: product.isActive,

          // Category and subcategory
          category: product.category,
          subCategory: product.subCategory,

          // Unit of measure information from product
          unitOfMeasure: product.unitOfMeasure,
        },

        // Unit of measure specific to this stock entry
        unitOfMeasure: shopStock.unitOfMeasure,

        // Helper fields for frontend
        availableQuantity: shopStock.quantity,
        conversionFactor: shopStock.unitOfMeasure?.conversionFactor || 1,
      };
    });

    return result;
  } catch (error) {
    console.error('Error in getProductByShopStock:', error);
    throw error;
  }
};

const getProductInfoByBatchId = async (batchId) => {
  const batch = await prisma.productBatch.findUnique({
    where: { id: batchId },
    select: {
      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!batch || !batch.product) return null;

  return { id: batch.product.id, name: batch.product.name };
};

module.exports = {
  getProductBatchById,
  getAllProductBatches,
  deleteProductBatch,
  createProductBatchWithAdditionalPrices,
  updateProductBatchWithAdditionalPrices,
  getProductByStoreStock,
  getProductByShopStock,
  getProductInfoByBatchId,
  getProductBatches,
};
