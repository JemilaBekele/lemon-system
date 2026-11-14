
const httpStatus = require('http-status');
const { subMonths } = require('date-fns');

const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');


const getSubProductDetails = async (subProductId, userId) => {
  try {
    // Get the user's accessible shops and stores
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        shops: { select: { id: true } },
        stores: { select: { id: true } },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const accessibleShopIds = user.shops.map((shop) => shop.id);
    const accessibleStoreIds = user.stores.map((store) => store.id);

    // If user has no shops or stores, return empty arrays
    if (accessibleShopIds.length === 0 && accessibleStoreIds.length === 0) {
      throw new Error('User has no shop or store access');
    }

    const shopStockWhere =
      accessibleShopIds.length > 0
        ? { status: 'Available', shopId: { in: accessibleShopIds } }
        : { status: 'Available', shopId: { in: [] } };

    const storeStockWhere =
      accessibleStoreIds.length > 0
        ? { status: 'Available', storeId: { in: accessibleStoreIds } }
        : { status: 'Available', storeId: { in: [] } };

    // Get the subproduct with related data
    const subProduct = await prisma.subProduct.findUnique({
      where: { id: subProductId },
      include: {
        product: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            subCategory: {
              select: {
                id: true,
                name: true,
              },
            },
            unitOfMeasure: true,
          },
        },
        additionalPrices: {
          where: {
            OR: [
              { shopId: null }, // Global additional prices
              { shopId: { in: accessibleShopIds } }, // Shop-specific prices
            ],
          },
          include: {
            shop: {
              include: {
                branch: true,
              },
            },
          },
        },
        productBatches: {
          include: {
            store: {
              include: {
                branch: true,
              },
            },
            ShopStock: {
              where: shopStockWhere,
              include: {
                shop: {
                  include: {
                    branch: true,
                  },
                },
                unitOfMeasure: true,
              },
            },
            StoreStock: {
              where: storeStockWhere,
              include: {
                store: {
                  include: {
                    branch: true,
                  },
                },
                unitOfMeasure: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!subProduct) {
      throw new Error('SubProduct not found');
    }

    // Get additional prices for this subproduct
    const additionalPrices = await prisma.additionalPrice.findMany({
      where: {
        subProductId,
        OR: [
          { shopId: null }, // Global additional prices
          { shopId: { in: accessibleShopIds } }, // Shop-specific prices
        ],
      },
      include: {
        shop: {
          include: {
            branch: true,
          },
        },
      },
    });

    // Get stock ledger entries for this subproduct (filtered by accessible shops/stores)
    const stockLedgers = await prisma.stockLedger.findMany({
      where: {
        batch: {
          subProductId,
        },
        OR: [
          { storeId: { in: accessibleStoreIds } },
          { shopId: { in: accessibleShopIds } },
        ],
      },
      include: {
        batch: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                productCode: true,
              },
            },
          },
        },
        unitOfMeasure: true,
        store: {
          include: {
            branch: true,
          },
        },
        shop: {
          include: {
            branch: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        movementDate: 'desc',
      },
    });

    // Calculate total quantities across accessible stores and shops
    const storeStocks = await prisma.storeStock.groupBy({
      by: ['storeId'],
      where: {
        batch: {
          subProductId,
        },
        status: 'Available',
        storeId: { in: accessibleStoreIds },
      },
      _sum: {
        quantity: true,
      },
    });

    const shopStocks = await prisma.shopStock.groupBy({
      by: ['shopId'],
      where: {
        batch: {
          subProductId,
        },
        status: 'Available',
        shopId: { in: accessibleShopIds },
      },
      _sum: {
        quantity: true,
      },
    });

    // Get store and shop details (only accessible ones)
    const storeIds = storeStocks.map((stock) => stock.storeId);
    const shopIds = shopStocks.map((stock) => stock.shopId);

    const stores = await prisma.store.findMany({
      where: {
        id: {
          in: storeIds.length > 0 ? storeIds : [],
        },
      },
      include: { branch: true },
    });

    const shops = await prisma.shop.findMany({
      where: {
        id: {
          in: shopIds.length > 0 ? shopIds : [],
        },
      },
      include: { branch: true },
    });

    // Create location stock details
    const storeStockDetails = storeStocks.map((stock) => {
      const store = stores.find((s) => s.id === stock.storeId);
      return {
        storeId: stock.storeId,
        storeName: store?.name || 'Unknown Store',
        branchId: store?.branch?.id,
        branchName: store?.branch?.name,
        quantity: stock._sum.quantity || 0,
        type: 'store',
        additionalPrice: null, // Stores don't have additional prices
      };
    });

    const shopStockDetails = shopStocks.map((stock) => {
      const shop = shops.find((s) => s.id === stock.shopId);
      // Find additional price for this shop
      const additionalPrice = additionalPrices.find(
        (price) => price.shopId === stock.shopId,
      );
      // Find global additional price (shopId = null)
      const globalAdditionalPrice = additionalPrices.find(
        (price) => price.shopId === null,
      );

      return {
        shopId: stock.shopId,
        shopName: shop?.name || 'Unknown Shop',
        branchId: shop?.branch?.id,
        branchName: shop?.branch?.name,
        quantity: stock._sum.quantity || 0,
        type: 'shop',
        additionalPrice: additionalPrice || globalAdditionalPrice, // Shop-specific or global
      };
    });

    // Process batches with detailed information
    const processedBatches = subProduct.productBatches.map((batch) => {
      const batchStoreQuantity = batch.StoreStock.filter(
        (stock) => stock.status === 'Available',
      ).reduce((total, stock) => total + stock.quantity, 0);

      const batchShopQuantity = batch.ShopStock.filter(
        (stock) => stock.status === 'Available',
      ).reduce((total, stock) => total + stock.quantity, 0);

      const batchTotalQuantity = batchStoreQuantity + batchShopQuantity;

      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        price: batch.price,
        // On-hand quantity (Available, in the user's stores and shops)
        stock: batchTotalQuantity,
        storeId: batch.storeId,
        store:
          batch.store && accessibleStoreIds.includes(batch.storeId)
            ? {
                id: batch.store.id,
                name: batch.store.name,
                branch: batch.store.branch,
              }
            : null,
        shopStocks: batch.ShopStock.map((stock) => ({
          id: stock.id,
          shopId: stock.shopId,
          shopName: stock.shop?.name,
          branchId: stock.shop?.branch?.id,
          branchName: stock.shop?.branch?.name,
          quantity: stock.quantity,
          status: stock.status,
          unitOfMeasure: stock.unitOfMeasure,
        })),
        storeStocks: batch.StoreStock.map((stock) => ({
          id: stock.id,
          storeId: stock.storeId,
          storeName: stock.store?.name,
          branchId: stock.store?.branch?.id,
          branchName: stock.store?.branch?.name,
          quantity: stock.quantity,
          status: stock.status,
          unitOfMeasure: stock.unitOfMeasure,
        })),
        batchStoreQuantity,
        batchShopQuantity,
        batchTotalQuantity,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      };
    });

    // Process additional prices (filtered by accessible shops)
    const processedAdditionalPrices = subProduct.additionalPrices
      .filter((price) => !price.shopId || accessibleShopIds.includes(price.shopId))
      .map((price) => ({
        id: price.id,
        label: price.label,
        price: price.price,
        shopId: price.shopId,
        shopName: price.shop?.name,
        branchId: price.shop?.branch?.id,
        branchName: price.shop?.branch?.name,
      }));

    // Process stock ledger entries (already filtered)
    const processedStockLedgers = stockLedgers.map((ledger) => ({
      id: ledger.id,
      invoiceNo: ledger.invoiceNo,
      movementType: ledger.movementType,
      quantity: ledger.quantity,
      unitOfMeasure: ledger.unitOfMeasure,
      reference: ledger.reference,
      userId: ledger.userId,
      user: ledger.user,
      store:
        ledger.store && accessibleStoreIds.includes(ledger.store.id)
          ? {
              id: ledger.store.id,
              name: ledger.store.name,
              branch: ledger.store.branch,
            }
          : null,
      shop:
        ledger.shop && accessibleShopIds.includes(ledger.shop.id)
          ? {
              id: ledger.shop.id,
              name: ledger.shop.name,
              branch: ledger.shop.branch,
            }
          : null,
      batch: ledger.batch
        ? {
            id: ledger.batch.id,
            batchNumber: ledger.batch.batchNumber,
            product: ledger.batch.product,
          }
        : null,
      notes: ledger.notes,
      movementDate: ledger.movementDate,
      createdAt: ledger.createdAt,
      updatedAt: ledger.updatedAt,
    }));

    // Calculate total quantities (only from accessible locations)
    const totalStoreQuantity = storeStockDetails.reduce(
      (total, store) => total + store.quantity,
      0,
    );
    const totalShopQuantity = shopStockDetails.reduce(
      (total, shop) => total + shop.quantity,
      0,
    );
    const overallTotalQuantity = totalStoreQuantity + totalShopQuantity;

    return {
      subProduct: {
        id: subProduct.id,
        subProductCode: subProduct.subProductCode,
        name: subProduct.name,
        imageUrl: subProduct.imageUrl,
        isActive: subProduct.isActive,
        createdAt: subProduct.createdAt,
        updatedAt: subProduct.updatedAt,
        // Parent product information
        parentProduct: {
          id: subProduct.product.id,
          productCode: subProduct.product.productCode,
          name: subProduct.product.name,
          generic: subProduct.product.generic,
          description: subProduct.product.description,
          sellPrice: subProduct.product.sellPrice,
          imageUrl: subProduct.product.imageUrl,
          category: subProduct.product.category,
          subCategory: subProduct.product.subCategory,
          unitOfMeasure: subProduct.product.unitOfMeasure,
          isActive: subProduct.product.isActive,
        },
        // SubProduct inherits unit of measure from parent product
        unitOfMeasure: subProduct.product.unitOfMeasure,
      },
      batches: processedBatches,
      additionalPrices: processedAdditionalPrices,
      stockLedgers: processedStockLedgers,
      locationStocks: [...storeStockDetails, ...shopStockDetails],
      summary: {
        totalStoreQuantity,
        totalShopQuantity,
        overallTotalQuantity,
        batchCount: processedBatches.length,
        storeCount: storeStockDetails.length,
        shopCount: shopStockDetails.length,
        ledgerCount: processedStockLedgers.length,
        additionalPriceCount: processedAdditionalPrices.length,
      },
    };
  } catch (error) {
    console.error('Error in getSubProductDetails:', error);
    throw error;
  }
};

module.exports = {  getSubProductDetails };    