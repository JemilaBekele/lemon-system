/* eslint-disable no-underscore-dangle */
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');
const { runStockTransaction } = require('../utils/stockTransaction');
const { uploadImage } = require('../utils/upload.util');
const { getAccessibleLocations } = require('../utils/accessibleLocations');

// Get Product by ID
const getProductById = async (id) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      subCategory: true,
      batches: true,
      unitOfMeasure: true,
      subProducts: {
        include: { additionalPrices: { include: { shop: true } } },
      },
      AdditionalPrice: {
        // Product-level prices only; sub-product prices come with each sub-product
        where: { subProductId: null },
        include: {
          shop: true,
        },
      },
    },
  });
  return product;
};
// Sale details for stock-ledger rows caused by a sale or a sale correction:
// customer, salesperson (who created the sale) and the line's unit price.
// Returns Map ledgerId -> { sale: { id, invoiceNo, customerName,
// salesperson }, unitPrice }. Older rows have no sourceType/sourceId; their
// reference ("Sell-INV-0001", "Sell-Delete-INV-0001") still names the sale.
const SALE_ITEM_ID_IN_NOTES = /Item:\s*([0-9a-f-]{36})/i;
const SALE_REFERENCE = /^Sell-(?:Delete-)?(.+)$/;

const loadLedgerSaleInfo = async (ledgers) => {
  const saleIds = new Set();
  const invoiceNos = new Set();
  const correctionIds = new Set();
  ledgers.forEach((ledger) => {
    if (ledger.sourceType === 'SALE' && ledger.sourceId) {
      saleIds.add(ledger.sourceId);
    } else if (ledger.sourceType === 'SELL_CORRECTION' && ledger.sourceId) {
      correctionIds.add(ledger.sourceId);
    } else if (!ledger.sourceType && ledger.reference) {
      const match = SALE_REFERENCE.exec(ledger.reference);
      if (match) invoiceNos.add(match[1]);
    }
  });
  if (saleIds.size + invoiceNos.size + correctionIds.size === 0) {
    return new Map();
  }

  const saleSelect = {
    id: true,
    invoiceNo: true,
    customer: { select: { name: true, companyName: true } },
    createdBy: { select: { id: true, name: true } },
    items: {
      select: {
        id: true,
        unitPrice: true,
        batches: { select: { batchId: true } },
      },
    },
  };

  const [sells, corrections] = await Promise.all([
    saleIds.size + invoiceNos.size > 0
      ? prisma.sell.findMany({
          where: {
            OR: [
              { id: { in: [...saleIds] } },
              { invoiceNo: { in: [...invoiceNos] } },
            ],
          },
          select: saleSelect,
        })
      : [],
    correctionIds.size > 0
      ? prisma.sellStockCorrection.findMany({
          where: { id: { in: [...correctionIds] } },
          select: {
            id: true,
            sell: { select: saleSelect },
            items: {
              select: {
                unitPrice: true,
                batches: { select: { batchId: true } },
              },
            },
          },
        })
      : [],
  ]);

  const saleView = (sell) =>
    sell
      ? {
          id: sell.id,
          invoiceNo: sell.invoiceNo,
          customerName: sell.customer
            ? sell.customer.companyName || sell.customer.name
            : null,
          salesperson: sell.createdBy
            ? { id: sell.createdBy.id, name: sell.createdBy.name }
            : null,
        }
      : null;

  const sellById = new Map(sells.map((sell) => [sell.id, sell]));
  const sellByInvoice = new Map(sells.map((sell) => [sell.invoiceNo, sell]));
  const correctionById = new Map(corrections.map((c) => [c.id, c]));

  // The line that moved this batch: by the item id in the notes, else the
  // line whose batches include this batch
  const findLine = (lines, ledger) => {
    const match = ledger.notes && SALE_ITEM_ID_IN_NOTES.exec(ledger.notes);
    const byId = match && lines.find((line) => line.id === match[1]);
    return (
      byId ||
      lines.find((line) =>
        (line.batches || []).some((b) => b.batchId === ledger.batchId),
      ) ||
      null
    );
  };

  const info = new Map();
  ledgers.forEach((ledger) => {
    let sell = null;
    let line = null;
    if (ledger.sourceType === 'SELL_CORRECTION') {
      const correction = correctionById.get(ledger.sourceId);
      if (!correction) return;
      sell = correction.sell;
      line = findLine(correction.items, ledger);
    } else {
      sell =
        (ledger.sourceType === 'SALE' && sellById.get(ledger.sourceId)) ||
        (!ledger.sourceType &&
          ledger.reference &&
          SALE_REFERENCE.test(ledger.reference) &&
          sellByInvoice.get(SALE_REFERENCE.exec(ledger.reference)[1])) ||
        null;
      if (!sell) return;
      line = findLine(sell.items, ledger);
    }
    info.set(ledger.id, {
      sale: saleView(sell),
      unitPrice: line ? Number(line.unitPrice) : null,
    });
  });
  return info;
};

const getSubProductsByProductId = async (productId) => {
  const subProducts = await prisma.subProduct.findMany({
    where: {
      productId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          productCode: true,
        },
      },
      productBatches: true, // optional: include batches per sub-product
    },
  });

  return subProducts;
};
const getAllProducts = async (userId) => {
  // Get the shops and stores the user has access to (admins: all of them)
  const locations = await getAccessibleLocations(userId);

  if (!locations) {
    throw new Error('User not found');
  }

  const accessibleShopIds = locations.shopIds;
  const accessibleStoreIds = locations.storeIds;

  // Get shops and stores the user can access with branch information
  const [shops, stores] = await Promise.all([
    prisma.shop.findMany({
      where: {
        id: { in: accessibleShopIds },
      },
      select: {
        id: true,
        name: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.store.findMany({
      where: {
        id: { in: accessibleStoreIds },
      },
      select: {
        id: true,
        name: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  // Create maps for shop and store names including branch info
  const shopMap = Object.fromEntries(shops.map((shop) => [shop.id, shop.name]));
  const storeMap = Object.fromEntries(
    stores.map((store) => [store.id, store.name]),
  );

  // Create maps for shop and store branch info
  // const shopBranchMap = Object.fromEntries(
  //   shops.map((shop) => [
  //     shop.id,
  //     {
  //       branchId: shop.branch?.id,
  //       branchName: shop.branch?.name,
  //     },
  //   ]),
  // );

  // const storeBranchMap = Object.fromEntries(
  //   stores.map((store) => [
  //     store.id,
  //     {
  //       branchId: store.branch?.id,
  //       branchName: store.branch?.name,
  //     },
  //   ]),
  // );

  // Get all products with their stock information
  const products = await prisma.product.findMany({
    orderBy: {
      name: 'asc',
    },
    include: {
      category: true,
      subCategory: true,
      subProducts: true,

      unitOfMeasure: true,
      AdditionalPrice: {
        include: {
          shop: true,
        },
      },
      batches: {
        include: {
          ShopStock: {
            where: {
              status: 'Available',
              shopId: { in: accessibleShopIds }, // Filter by accessible shops
            },
            include: {
              shop: {
                select: { id: true, name: true },
              },
            },
          },
          StoreStock: {
            where: {
              status: 'Available',
              storeId: { in: accessibleStoreIds }, // Filter by accessible stores
            },
            include: {
              store: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  });

  // Calculate detailed stock information for each product
  const productsWithDetailedStock = products.map((product) => {
    const shopStocks = {};
    const storeStocks = {};

    let totalShopStock = 0;
    let totalStoreStock = 0;

    // Initialize only accessible shops with 0 quantity
    shops.forEach((shop) => {
      shopStocks[shop.name] = 0;
    });

    // Initialize only accessible stores with 0 quantity
    stores.forEach((store) => {
      storeStocks[store.name] = 0;
    });

    // Calculate stock from all batches
    product.batches.forEach((batch) => {
      // Process shop stock
      batch.ShopStock.forEach((shopStock) => {
        const shopName = shopMap[shopStock.shopId];
        if (shopName) {
          // Only count if shop is accessible
          shopStocks[shopName] =
            (shopStocks[shopName] || 0) + shopStock.quantity;
          totalShopStock += shopStock.quantity;
        }
      });

      // Process store stock
      batch.StoreStock.forEach((storeStock) => {
        const storeName = storeMap[storeStock.storeId];
        if (storeName) {
          // Only count if store is accessible
          storeStocks[storeName] =
            (storeStocks[storeName] || 0) + storeStock.quantity;
          totalStoreStock += storeStock.quantity;
        }
      });
    });

    // Convert shopStocks to include branch info
    const shopStocksWithBranch = {};
    Object.entries(shopStocks).forEach(([shopName, quantity]) => {
      // Find the shop to get branch info
      const shop = shops.find((s) => s.name === shopName);
      if (shop) {
        shopStocksWithBranch[shopName] = {
          quantity,
          branchId: shop.branch?.id,
          branchName: shop.branch?.name,
        };
      }
    });

    // Convert storeStocks to include branch info
    const storeStocksWithBranch = {};
    Object.entries(storeStocks).forEach(([storeName, quantity]) => {
      // Find the store to get branch info
      const store = stores.find((s) => s.name === storeName);
      if (store) {
        storeStocksWithBranch[storeName] = {
          quantity,
          branchId: store.branch?.id,
          branchName: store.branch?.name,
        };
      }
    });

    const totalStock = totalShopStock + totalStoreStock;

    return {
      ...product,
      stockSummary: {
        shopStocks: shopStocksWithBranch, // Object with shop names as keys and { quantity, branchId, branchName } as values
        storeStocks: storeStocksWithBranch, // Object with store names as keys and { quantity, branchId, branchName } as values
        totalShopStock,
        totalStoreStock,
        totalStock,
      },
    };
  });

  // Calculate overall totals across all products
  const overallTotals = productsWithDetailedStock.reduce(
    (totals, product) => {
      // Calculate shop-wise totals
      const shopTotals = { ...totals.shopTotals };
      Object.entries(product.stockSummary.shopStocks).forEach(
        ([shopName, stockInfo]) => {
          shopTotals[shopName] =
            (shopTotals[shopName] || 0) + stockInfo.quantity;
        },
      );

      // Calculate store-wise totals
      const storeTotals = { ...totals.storeTotals };
      Object.entries(product.stockSummary.storeStocks).forEach(
        ([storeName, stockInfo]) => {
          storeTotals[storeName] =
            (storeTotals[storeName] || 0) + stockInfo.quantity;
        },
      );

      return {
        totalShopStock:
          totals.totalShopStock + product.stockSummary.totalShopStock,
        totalStoreStock:
          totals.totalStoreStock + product.stockSummary.totalStoreStock,
        totalAllStock: totals.totalAllStock + product.stockSummary.totalStock,
        shopTotals,
        storeTotals,
      };
    },
    {
      totalShopStock: 0,
      totalStoreStock: 0,
      totalAllStock: 0,
      shopTotals: Object.fromEntries(shops.map((shop) => [shop.name, 0])),
      storeTotals: Object.fromEntries(stores.map((store) => [store.name, 0])),
    },
  );

  // Add overallTotals to each product
  const productsWithTotals = productsWithDetailedStock.map((product) => ({
    ...product,
    overallTotals,
  }));

  return {
    products: productsWithTotals,
    count: products.length,
  };
};
const getAllSubProducts = async (userId) => {
  try {
    console.log('=== Starting getAllSubProducts ===');
    console.log('User ID:', userId);

    // First, get the user with their accessible shops and stores
    console.log('Fetching user with shops and stores...');
    const locations = await getAccessibleLocations(userId);

    if (!locations) {
      console.error('User not found with ID:', userId);
      throw new Error('User not found');
    }
    console.log('User found:', {
      userId,
      isAdmin: locations.isAdmin,
      shopCount: locations.shopIds.length,
      storeCount: locations.storeIds.length,
    });

    // Get only the shops and stores the user has access to
    const accessibleShopIds = locations.shopIds;
    const accessibleStoreIds = locations.storeIds;
    console.log('Accessible shop IDs:', accessibleShopIds);
    console.log('Accessible store IDs:', accessibleStoreIds);

    // Get shops and stores the user can access with branch information
    console.log('Fetching shops and stores with branch info...');
    const [shops, stores] = await Promise.all([
      prisma.shop.findMany({
        where: {
          id: { in: accessibleShopIds },
        },
        select: {
          id: true,
          name: true,
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.store.findMany({
        where: {
          id: { in: accessibleStoreIds },
        },
        select: {
          id: true,
          name: true,
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    console.log('Shops found:', shops.length);
    console.log('Stores found:', stores.length);

    // Create maps for shop and store names
    const shopMap = Object.fromEntries(
      shops.map((shop) => [shop.id, shop.name]),
    );
    const storeMap = Object.fromEntries(
      stores.map((store) => [store.id, store.name]),
    );

    // Get all valid product IDs first
    console.log('Fetching valid product IDs...');
    const validProducts = await prisma.product.findMany({
      select: { id: true },
    });
    const validProductIds = validProducts.map((p) => p.id);
    console.log(`Found ${validProductIds.length} valid products`);

    // Check for orphaned subproducts (subproducts with productId not in validProductIds)
    console.log('Checking for orphaned subproducts...');
    const orphanedSubProducts = await prisma.subProduct.findMany({
      where: {
        NOT: {
          productId: { in: validProductIds },
        },
      },
      select: {
        id: true,
        name: true,
        subProductCode: true,
        productId: true,
      },
    });

    if (orphanedSubProducts.length > 0) {
      console.warn(
        `Found ${orphanedSubProducts.length} orphaned subproducts:`,
        orphanedSubProducts,
      );

      // Option 1: Delete orphaned subproducts (uncomment to enable)
      // await prisma.subProduct.deleteMany({
      //   where: {
      //     id: { in: orphanedSubProducts.map(sp => sp.id) }
      //   }
      // });
      // console.log(`Deleted ${orphanedSubProducts.length} orphaned subproducts`);

      // Option 2: Just warn and continue (skip them in the query)
      console.warn('Orphaned subproducts will be skipped');
    }

    // Get all subproducts with their stock information - only those with valid product IDs
    console.log('Fetching subproducts with batches and stock...');
    let subProducts;
    try {
      subProducts = await prisma.subProduct.findMany({
        where: {
          productId: { in: validProductIds }, // Only get subproducts with valid parent products
        },
        orderBy: {
          name: 'asc',
        },
        include: {
          product: {
            include: {
              category: true,
              subCategory: true,
              unitOfMeasure: true,
            },
          },
          additionalPrices: {
            include: {
              shop: true,
            },
          },
          productBatches: {
            include: {
              ShopStock: {
                where: {
                  status: 'Available',
                  shopId: { in: accessibleShopIds },
                },
                include: {
                  shop: {
                    select: { id: true, name: true },
                  },
                  unitOfMeasure: true,
                },
              },
              StoreStock: {
                where: {
                  status: 'Available',
                  storeId: { in: accessibleStoreIds },
                },
                include: {
                  store: {
                    select: { id: true, name: true },
                  },
                  unitOfMeasure: true,
                },
              },
            },
          },
        },
      });
      console.log(
        'Subproducts fetched successfully. Count:',
        subProducts.length,
      );
    } catch (error) {
      console.error('Error fetching subproducts with filter:', error);

      // Fallback: Try without the product filter
      console.log('Trying fallback query without product filter...');
      subProducts = await prisma.subProduct.findMany({
        orderBy: {
          name: 'asc',
        },
        include: {
          product: {
            include: {
              category: true,
              subCategory: true,
              unitOfMeasure: true,
            },
          },
          additionalPrices: {
            include: {
              shop: true,
            },
          },
          productBatches: {
            include: {
              ShopStock: {
                where: {
                  status: 'Available',
                  shopId: { in: accessibleShopIds },
                },
                include: {
                  shop: {
                    select: { id: true, name: true },
                  },
                  unitOfMeasure: true,
                },
              },
              StoreStock: {
                where: {
                  status: 'Available',
                  storeId: { in: accessibleStoreIds },
                },
                include: {
                  store: {
                    select: { id: true, name: true },
                  },
                  unitOfMeasure: true,
                },
              },
            },
          },
        },
      });
      console.log(
        'Fallback query succeeded. Subproducts count:',
        subProducts.length,
      );
    }

    // Filter out subproducts with null product in memory
    const validSubProducts = subProducts.filter((sp) => sp.product !== null);

    if (validSubProducts.length < subProducts.length) {
      console.warn(
        `Filtered out ${
          subProducts.length - validSubProducts.length
        } subproducts with null parent product`,
      );
    }

    // Calculate detailed stock information for each subproduct
    console.log('Calculating stock details for each subproduct...');
    const subProductsWithDetailedStock = validSubProducts.map((subProduct) => {
      const shopStocks = {};
      const storeStocks = {};

      let totalShopStock = 0;
      let totalStoreStock = 0;

      // Initialize only accessible shops with 0 quantity
      shops.forEach((shop) => {
        shopStocks[shop.name] = 0;
      });

      // Initialize only accessible stores with 0 quantity
      stores.forEach((store) => {
        storeStocks[store.name] = 0;
      });

      // Calculate stock from all batches
      if (subProduct.productBatches && subProduct.productBatches.length > 0) {
        subProduct.productBatches.forEach((batch) => {
          // Process shop stock
          if (batch.ShopStock && batch.ShopStock.length > 0) {
            batch.ShopStock.forEach((shopStock) => {
              const shopName = shopMap[shopStock.shopId];
              if (shopName) {
                shopStocks[shopName] =
                  (shopStocks[shopName] || 0) + shopStock.quantity;
                totalShopStock += shopStock.quantity;
              }
            });
          }

          // Process store stock
          if (batch.StoreStock && batch.StoreStock.length > 0) {
            batch.StoreStock.forEach((storeStock) => {
              const storeName = storeMap[storeStock.storeId];
              if (storeName) {
                storeStocks[storeName] =
                  (storeStocks[storeName] || 0) + storeStock.quantity;
                totalStoreStock += storeStock.quantity;
              }
            });
          }
        });
      }

      // Convert shopStocks to include branch info
      const shopStocksWithBranch = {};
      Object.entries(shopStocks).forEach(([shopName, quantity]) => {
        const shop = shops.find((s) => s.name === shopName);
        if (shop) {
          shopStocksWithBranch[shopName] = {
            quantity,
            branchId: shop.branch?.id,
            branchName: shop.branch?.name,
          };
        }
      });

      // Convert storeStocks to include branch info
      const storeStocksWithBranch = {};
      Object.entries(storeStocks).forEach(([storeName, quantity]) => {
        const store = stores.find((s) => s.name === storeName);
        if (store) {
          storeStocksWithBranch[storeName] = {
            quantity,
            branchId: store.branch?.id,
            branchName: store.branch?.name,
          };
        }
      });

      const totalStock = totalShopStock + totalStoreStock;

      return {
        id: subProduct.id,
        subProductCode: subProduct.subProductCode,
        name: subProduct.name,
        imageUrl: subProduct.imageUrl,
        isActive: subProduct.isActive,
        createdAt: subProduct.createdAt,
        updatedAt: subProduct.updatedAt,
        product: subProduct.product,
        unitOfMeasure: subProduct.product?.unitOfMeasure || null,
        additionalPrices: subProduct.additionalPrices || [],
        stockSummary: {
          shopStocks: shopStocksWithBranch,
          storeStocks: storeStocksWithBranch,
          totalShopStock,
          totalStoreStock,
          totalStock,
        },
      };
    });

    // Calculate overall totals across all subproducts
    console.log('Calculating overall totals...');
    const overallTotals = subProductsWithDetailedStock.reduce(
      (totals, subProduct) => {
        const shopTotals = { ...totals.shopTotals };
        Object.entries(subProduct.stockSummary.shopStocks).forEach(
          ([shopName, stockInfo]) => {
            shopTotals[shopName] =
              (shopTotals[shopName] || 0) + stockInfo.quantity;
          },
        );

        const storeTotals = { ...totals.storeTotals };
        Object.entries(subProduct.stockSummary.storeStocks).forEach(
          ([storeName, stockInfo]) => {
            storeTotals[storeName] =
              (storeTotals[storeName] || 0) + stockInfo.quantity;
          },
        );

        return {
          totalShopStock:
            totals.totalShopStock + subProduct.stockSummary.totalShopStock,
          totalStoreStock:
            totals.totalStoreStock + subProduct.stockSummary.totalStoreStock,
          totalAllStock:
            totals.totalAllStock + subProduct.stockSummary.totalStock,
          shopTotals,
          storeTotals,
        };
      },
      {
        totalShopStock: 0,
        totalStoreStock: 0,
        totalAllStock: 0,
        shopTotals: Object.fromEntries(shops.map((shop) => [shop.name, 0])),
        storeTotals: Object.fromEntries(stores.map((store) => [store.name, 0])),
      },
    );

    // Add overallTotals to each subproduct
    const subProductsWithTotals = subProductsWithDetailedStock.map(
      (subProduct) => ({
        ...subProduct,
        overallTotals,
      }),
    );

    console.log('=== getAllSubProducts completed successfully ===');
    console.log('Total valid subproducts returned:', validSubProducts.length);

    return {
      subProducts: subProductsWithTotals,
      count: validSubProducts.length,
    };
  } catch (error) {
    if (error.code) console.error('Error code:', error.code);
    if (error.meta) console.error('Error meta:', error.meta);
    throw error;
  }
};
const getActiveAllProducts = async (filter = {}, includeInactive = false) => {
  const whereClause = includeInactive ? filter : { ...filter, isActive: true };

  const products = await prisma.product.findMany({
    where: whereClause,
    orderBy: { name: 'asc' },
    include: {
      category: true,
      subCategory: true,
      subProducts: true,

      unitOfMeasure: true,
    },
  });

  return {
    products,
    count: products.length,
  };
};

// Get Product by Product CgenerateUniqueProductCodeode
const getProductByCode = async (productCode) => {
  const product = await prisma.product.findFirst({
    where: { productCode },
  });
  return product;
};

const getBatchesByProduct = async (productId, subProductId) => {
  const batches = await prisma.productBatch.findMany({
    where: {
      productId,
      ...(subProductId && { subProductId }), // 👈 only applied if exists
    },
    orderBy: [{ expiryDate: 'asc' }, { batchNumber: 'asc' }],
    include: {
      product: true,
      subProduct: true, // optional but useful
      store: true,
    },
  });

  return {
    batches,
    count: batches.length,
  };
};

const generateBatchNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `BATCH-${year}${month}${day}-${random}`;
};
// Optional price from the product form: undefined = not sent (leave as is),
// '' or null = clear it, otherwise a number of 0 or more
const parseOptionalPrice = (value, label) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid ${label}`);
  }
  return parsed;
};

const parseFormData = (data) => {
  const parsed = { ...data };

  // Boolean fields
  if (parsed.isActive !== undefined) {
    parsed.isActive = parsed.isActive === 'true' || parsed.isActive === true;
  }

  // Number fields
  if (
    parsed.sellPrice !== undefined &&
    parsed.sellPrice !== null &&
    parsed.sellPrice !== ''
  ) {
    parsed.sellPrice = parseFloat(parsed.sellPrice);
  } else if (parsed.sellPrice === '') {
    parsed.sellPrice = null;
  }

  // Price used by the e-commerce shop
  parsed.ecommercePrice = parseOptionalPrice(
    parsed.ecommercePrice,
    'e-commerce price',
  );
  if (parsed.ecommercePrice === undefined) delete parsed.ecommercePrice;

  // Low-stock threshold lives on the product (not on each batch)
  if (parsed.warningQuantity !== undefined) {
    const warningQuantity = parseInt(parsed.warningQuantity, 10);
    parsed.warningQuantity =
      Number.isNaN(warningQuantity) || warningQuantity < 0
        ? 0
        : warningQuantity;
  }

  return parsed;
};
// Clean an additional-price list from the form ({ label, price, shopId }):
// drops rows without a label and rejects the same label twice for one shop.
const normalizeAdditionalPrices = (prices, ownerLabel) => {
  const list = (Array.isArray(prices) ? prices : Object.values(prices || {}))
    .filter(
      (price) => price && price.label && String(price.label).trim() !== '',
    )
    .map((price) => ({
      label: String(price.label).trim(),
      price: parseFloat(price.price) || 0,
      shopId: price.shopId || null,
    }));
  const seen = new Set();
  list.forEach((price) => {
    const key = `${price.label.toLowerCase()}|${price.shopId || ''}`;
    if (seen.has(key)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${ownerLabel}: the price "${price.label}" is listed twice for the same shop`,
      );
    }
    seen.add(key);
  });
  return list;
};

// Replace one sub-product's own additional prices
const replaceSubProductPrices = async (tx, productId, subProductId, prices) => {
  await tx.additionalPrice.deleteMany({ where: { subProductId } });
  if (prices.length > 0) {
    await tx.additionalPrice.createMany({
      data: prices.map((price) => ({ ...price, productId, subProductId })),
    });
  }
};

const generateUniqueProductCode = async () => {
  const prefix = 'PROD'; // You can customize this prefix
  const maxAttempts = 10;
  let productCode;

  // Generate multiple codes at once and check them in a single query
  const codeAttempts = Array.from({ length: maxAttempts }, () => {
    const randomNumber = Math.floor(10000 + Math.random() * 90000); // 5-digit random number
    return `${prefix}-${randomNumber}`;
  });

  // Check all codes at once
  const existingProducts = await Promise.all(
    codeAttempts.map((code) => getProductByCode(code)),
  );

  // Find the first unique code
  const uniqueCodeIndex = existingProducts.findIndex((product) => !product);

  if (uniqueCodeIndex !== -1) {
    productCode = codeAttempts[uniqueCodeIndex];
  } else {
    // Fallback: use timestamp for uniqueness
    const timestamp = Date.now();
    productCode = `${prefix}-${timestamp}`;
  }

  return productCode;
};
const getProductByName = async (productName) => {
  if (!productName || productName.trim() === '') {
    return null;
  }

  return prisma.product.findFirst({
    where: {
      name: {
        equals: productName,
      },
    },
  });
};
const generateUniqueSubProductCode = async (baseProductCode, index = 0) => {
  console.log(
    `Generating subproduct code from base: ${baseProductCode}, index: ${index}`,
  );

  // Extract just the prefix (e.g., "PROD" from "PROD-30147")
  let prefix = 'SUB'; // Default prefix

  if (baseProductCode) {
    // Try to extract prefix before the first dash
    const dashIndex = baseProductCode.indexOf('-');
    if (dashIndex > 0) {
      prefix = baseProductCode.substring(0, dashIndex);
    } else {
      // If no dash, use the whole code as prefix
      prefix = baseProductCode;
    }
  }

  // Start with base code like PROD-30147-SUB-001
  const baseSuffix = `${baseProductCode}-SUB-${String(index + 1).padStart(
    3,
    '0',
  )}`;
  let subProductCode = baseSuffix;
  let counter = 1;

  // Keep trying until we find a unique code
  while (true) {
    try {
      // Check if code already exists
      const existing = await prisma.subProduct.findUnique({
        where: { subProductCode },
      });

      if (!existing) {
        // Code is available
        console.log(`Generated unique subproduct code: ${subProductCode}`);
        return subProductCode;
      }

      // If code exists, try a different variation
      console.log(
        `Subproduct code ${subProductCode} already exists, trying alternative...`,
      );
      subProductCode = `${baseSuffix}-${counter}`;
      counter++;
    } catch (error) {
      console.error('Error checking subproduct code:', error);
      // Fallback: use timestamp-based code
      const timestamp = Date.now().toString().slice(-6);
      subProductCode = `${prefix}-SUB-${timestamp}-${String(index + 1).padStart(
        3,
        '0',
      )}`;
      console.log(`Using fallback code: ${subProductCode}`);
      return subProductCode;
    }
  }
};
const createProduct = async (productBody, files) => {
  console.log('=== CREATE PRODUCT SERVICE START ===');
  console.log('productBody keys:', Object.keys(productBody || {}));
  console.log(
    'productBody.subProducts:',
    JSON.stringify(productBody.subProducts, null, 2),
  );
  console.log('Files keys:', Object.keys(files || {}));

  // Generate product code if not provided
  let { productCode } = productBody;
  const { name } = productBody;

  console.log('Initial productCode:', productCode);
  console.log('Initial name:', name);

  if (!productCode || productCode.trim() === '') {
    console.log('Generating unique product code');
    productCode = await generateUniqueProductCode();
  }

  // Check if product with same code already exists
  if (await getProductByCode(productCode)) {
    console.log('Product code already taken:', productCode);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Product code already taken');
  }
  if (await getProductByName(name)) {
    console.log('Product name already exists:', name);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Product name already exists');
  }

  console.log('Product code will be:', productCode);

  // Try to parse the data with error handling
  let parsedData;
  try {
    console.log('Calling parseFormData...');
    parsedData = parseFormData(productBody);
    console.log('Parsed data successfully');
  } catch (error) {
    console.error('Error in parseFormData:', error);
    console.error('Error stack:', error.stack);
    // A clear message (e.g. an invalid price) is passed on as is
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid form data format');
  }

  console.log('Parsed data keys:', Object.keys(parsedData || {}));
  console.log('Parsed data:', JSON.stringify(parsedData, null, 2));

  // Ensure sellPrice has a value
  if (parsedData.sellPrice === undefined || parsedData.sellPrice === null) {
    console.log('Setting default sellPrice to 0');
    parsedData.sellPrice = 0;
  }

  parsedData.productCode = productCode; // Add generated code to parsed data

  let mainProductImageUrl = null;
  const subProductsData = parsedData.subProducts || [];

  console.log('subProductsData:', subProductsData);
  console.log('subProductsData length:', subProductsData.length);

  // Process the main product image if provided
  const mainImageFile = Array.isArray(files?.image)
    ? files.image[0]
    : files?.image;

  console.log('Main image file:', mainImageFile ? 'Present' : 'Not present');

  if (mainImageFile) {
    try {
      console.log('Uploading main product image...');
      mainProductImageUrl = await uploadImage(mainImageFile, 'product_images');
      console.log('Main product image uploaded:', mainProductImageUrl);
    } catch (err) {
      console.error('Error uploading main product image:', err);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Product image processing failed',
      );
    }
  }

  // Process subproduct images
  const subProductImages = {};

  // Log all file keys to debug
  console.log('All file keys available:', Object.keys(files || {}));

  // Handle subproduct images - they might be named like subproduct_image_0, subproduct_image_1, etc.
  Object.keys(files || {}).forEach((key) => {
    console.log(`Checking file key: ${key}`);
    if (key.startsWith('subproduct_image_')) {
      const index = key.replace('subproduct_image_', '');
      console.log(`Found subproduct image key: ${key} for index ${index}`);

      const file = Array.isArray(files[key]) ? files[key][0] : files[key];
      if (file) {
        subProductImages[index] = file;
        console.log(`Found subproduct image for index ${index}:`, {
          originalname: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        });
      } else {
        console.log(`No file found for key ${key}`);
      }
    }
  });

  console.log('subProductImages found:', Object.keys(subProductImages));

  const { additionalPrices, subProducts, ...productData } = parsedData;

  console.log('Creating product with data:', productData);
  console.log('Additional prices:', additionalPrices);
  console.log('Product data sellPrice:', productData.sellPrice);

  // Filter out additional prices with empty/null labels
  const validAdditionalPrices = normalizeAdditionalPrices(
    additionalPrices,
    'Product',
  );

  console.log('Valid additional prices:', validAdditionalPrices);
  console.log('Valid additional prices count:', validAdditionalPrices.length);

  // Create product with subproducts in a transaction
  const result = await runStockTransaction(async (prisma) => {
    // Create main product
    console.log('Creating main product in database...');

    const productDataWithRelations = {
      ...productData,
      imageUrl: mainProductImageUrl || parsedData.imageUrl || '',
    };

    // Only add AdditionalPrice relation if there are valid additional prices
    if (validAdditionalPrices.length > 0) {
      productDataWithRelations.AdditionalPrice = {
        create: validAdditionalPrices,
      };
    }

    const product = await prisma.product.create({
      data: productDataWithRelations,
    });

    console.log('Main product created with ID:', product.id);
    console.log('Main product code:', product.productCode);

    // Create subproducts if provided
    if (subProductsData && subProductsData.length > 0) {
      console.log(`Creating ${subProductsData.length} subproducts`);

      // Generate unique codes for all subproducts first
      const subProductCodes = [];
      for (let i = 0; i < subProductsData.length; i++) {
        const subProductCode = await generateUniqueSubProductCode(
          product.productCode,
          i,
        );
        subProductCodes.push(subProductCode);
        console.log(
          `Generated subproduct code for index ${i}:`,
          subProductCode,
        );
      }

      const subProductPromises = subProductsData.map(
        async (subProductData, index) => {
          console.log(`Processing subproduct ${index}:`, subProductData);

          let subProductImageUrl = null;

          // Upload subproduct image if provided
          if (subProductImages[index]) {
            try {
              console.log(`Uploading subproduct ${index} image...`);
              subProductImageUrl = await uploadImage(
                subProductImages[index],
                'subproduct_images',
              );
              console.log(
                `Subproduct ${index} image uploaded:`,
                subProductImageUrl,
              );
            } catch (err) {
              console.error(
                `Failed to upload subproduct image for index ${index}:`,
                err,
              );
            }
          } else {
            console.log(`No image found for subproduct ${index}`);
          }

          // Convert isActive from string to boolean
          const isActive =
            subProductData.isActive === 'true' ||
            subProductData.isActive === true ||
            subProductData.isActive === '1';

          console.log(`Subproduct ${index} isActive:`, {
            original: subProductData.isActive,
            converted: isActive,
            type: typeof isActive,
          });

          const subProductPrices = normalizeAdditionalPrices(
            subProductData.additionalPrices,
            subProductData.name || `Subproduct ${index + 1}`,
          );
          const subEcommercePrice = parseOptionalPrice(
            subProductData.ecommercePrice,
            'sub-product e-commerce price',
          );
          const subSellPrice = parseOptionalPrice(
            subProductData.sellPrice,
            'sub-product sell price',
          );
          const createdSubProduct = await prisma.subProduct.create({
            data: {
              name: subProductData.name || `Subproduct ${index + 1}`,
              subProductCode: subProductCodes[index],
              imageUrl: subProductImageUrl || subProductData.imageUrl || '',
              productId: product.id,
              isActive,
              ...(subSellPrice !== undefined && { sellPrice: subSellPrice }),
              ...(subEcommercePrice !== undefined && {
                ecommercePrice: subEcommercePrice,
              }),
            },
          });
          await replaceSubProductPrices(
            prisma,
            product.id,
            createdSubProduct.id,
            subProductPrices,
          );
          return createdSubProduct;
        },
      );

      const createdSubProducts = await Promise.all(subProductPromises);
      console.log(`Created ${createdSubProducts.length} subproducts`);
    } else {
      console.log('No subproducts to create');
    }

    // Fetch the complete product with relations
    const completeProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        unitOfMeasure: true,
        subProducts: true,
        AdditionalPrice: true,
      },
    });

    console.log('Complete product fetched:', completeProduct.id);
    return completeProduct;
  });

  console.log('=== CREATE PRODUCT SERVICE END ===');
  return { product: result };
};
const generateUniqueBatchNumber = async () => {
  const maxAttempts = 10;

  // Generate multiple batch numbers at once
  const batchNumbers = Array.from({ length: maxAttempts }, () =>
    generateBatchNumber(),
  );

  // Check which batch numbers already exist
  const existingBatches = await prisma.productBatch.findMany({
    where: {
      batchNumber: {
        in: batchNumbers,
      },
    },
    select: {
      batchNumber: true,
    },
  });

  const existingBatchNumbers = new Set(
    existingBatches.map((batch) => batch.batchNumber),
  );

  // Find the first unique batch number
  const uniqueBatchNumber = batchNumbers.find(
    (number) => !existingBatchNumbers.has(number),
  );

  if (!uniqueBatchNumber) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to generate unique batch number after multiple attempts',
    );
  }

  return uniqueBatchNumber;
};
const createProductBatch = async (productId, batchesData, userId) => {
  // Validate input
  if (!productId || !batchesData || !Array.isArray(batchesData)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Product ID and batches data array are required',
    );
  }

  if (batchesData.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'At least one batch data is required',
    );
  }

  if (batchesData.some((batch) => !batch)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Each batch data object is required',
    );
  }

  // Get the product with its unit of measure and subproducts
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      unitOfMeasure: true,
      subProducts: true,
    },
  });

  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }

  // Use the product's unit of measure ID
  const { unitOfMeasureId } = product;

  // Verify the product's unit of measure exists
  const unitOfMeasure = await prisma.unitOfMeasure.findUnique({
    where: { id: unitOfMeasureId },
  });

  if (!unitOfMeasure) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invalid unit of measure for this product',
    );
  }

  // Normalise opening stock and check every batch before writing anything.
  // Opening stock must land in a store: a ledger row or batch stock without
  // a location would claim stock that is not in any store or shop.
  const normalisedBatches = batchesData.map((batchData) => {
    let stock = 0;
    if (
      batchData.stock !== undefined &&
      batchData.stock !== null &&
      batchData.stock !== ''
    ) {
      stock = Number(batchData.stock);
      if (!Number.isInteger(stock) || stock < 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Batch stock must be a whole number of 0 or more',
        );
      }
    }
    if (stock > 0 && !batchData.storeId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'A store is required when a batch has opening stock',
      );
    }
    return { ...batchData, stock };
  });

  // Validate stores referenced by the batches
  const storeIds = [
    ...new Set(normalisedBatches.map((batch) => batch.storeId).filter(Boolean)),
  ];
  if (storeIds.length > 0) {
    const stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true },
    });
    const validStoreIds = new Set(stores.map((store) => store.id));
    const invalidStores = storeIds.filter((sid) => !validStoreIds.has(sid));
    if (invalidStores.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Invalid store IDs: ${invalidStores.join(', ')}`,
      );
    }
  }

  // Validate subproducts if specified in batch data
  const batchesWithSubProducts = normalisedBatches.filter(
    (batch) => batch.subProductId,
  );

  if (batchesWithSubProducts.length > 0) {
    const subProductIds = [
      ...new Set(batchesWithSubProducts.map((batch) => batch.subProductId)),
    ];

    const validSubProducts = await prisma.subProduct.findMany({
      where: {
        id: { in: subProductIds },
        productId,
        isActive: true,
      },
      select: { id: true },
    });

    const validSubProductIds = new Set(validSubProducts.map((sp) => sp.id));
    const invalidSubProducts = subProductIds.filter(
      (spId) => !validSubProductIds.has(spId),
    );

    if (invalidSubProducts.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Invalid subproduct IDs or subproducts do not belong to this product: ${invalidSubProducts.join(
          ', ',
        )}`,
      );
    }
  }

  // Check for duplicate batch numbers in the request
  const batchNumbersInRequest = normalisedBatches
    .filter((batch) => batch.batchNumber)
    .map((batch) => batch.batchNumber);

  const uniqueBatchNumbers = [...new Set(batchNumbersInRequest)];
  if (batchNumbersInRequest.length !== uniqueBatchNumbers.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Duplicate batch numbers found in the request',
    );
  }

  // Check for existing batch numbers in the database
  const existingBatches = await prisma.productBatch.findMany({
    where: {
      batchNumber: {
        in: batchNumbersInRequest,
      },
    },
    select: {
      batchNumber: true,
    },
  });

  if (existingBatches.length > 0) {
    const existingBatchNumbers = existingBatches.map(
      (batch) => batch.batchNumber,
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Batch numbers already exist: ${existingBatchNumbers.join(', ')}`,
    );
  }

  // Process all batches in parallel; each batch's writes are atomic
  const createdBatches = await Promise.all(
    normalisedBatches.map(async (batchData) => {
      // Generate batch number if not provided
      const batchNumber =
        batchData.batchNumber || (await generateUniqueBatchNumber());

      // Parse expiry date if provided
      let expiryDateISO = null;
      if (batchData.expiryDate) {
        const expiryDate = new Date(batchData.expiryDate);
        if (Number.isNaN(expiryDate.getTime())) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Invalid expiry date format for batch: ${batchNumber}`,
          );
        }
        expiryDateISO = expiryDate.toISOString();
      }

      const additionalPrices = Array.isArray(batchData.additionalPrices)
        ? batchData.additionalPrices
        : [];

      return runStockTransaction(async (tx) => {
        // Create the product batch
        const productBatch = await tx.productBatch.create({
          data: {
            batchNumber,
            expiryDate: expiryDateISO,
            price: parseFloat(batchData.price) || 0,
            productId,
            subProductId: batchData.subProductId || null,
            storeId: batchData.storeId || null,
          },
          include: {
            product: {
              include: {
                unitOfMeasure: true,
                subProducts: true,
              },
            },
            subProduct: true,
          },
        });

        // CREATE ADDITIONAL PRICES FOR PRODUCT/SUBPRODUCT
        await Promise.all(
          additionalPrices.map(async (additionalPrice) => {
            // Validate additional price data
            if (
              !additionalPrice ||
              !additionalPrice.label ||
              additionalPrice.price == null
            ) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Additional price must have label and price for batch: ${batchNumber}`,
              );
            }

            // Determine the productId for the additional price
            const targetProductId = additionalPrice.productId || productId;

            // Validate that the target product exists
            const targetProduct = await tx.product.findUnique({
              where: { id: targetProductId },
            });

            if (!targetProduct) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Product ${targetProductId} not found for additional price`,
              );
            }

            // For additional prices with subProductId, ensure it belongs to the correct product
            if (additionalPrice.subProductId) {
              const subProductExists = await tx.subProduct.findFirst({
                where: {
                  id: additionalPrice.subProductId,
                  productId: targetProductId,
                },
              });

              if (!subProductExists) {
                throw new ApiError(
                  httpStatus.BAD_REQUEST,
                  `Subproduct ${additionalPrice.subProductId} does not belong to product ${targetProductId}`,
                );
              }
            }

            // Check for duplicate additional price labels for the same product/subproduct combination
            const existingAdditionalPrice = await tx.additionalPrice.findFirst({
              where: {
                productId: targetProductId,
                subProductId: additionalPrice.subProductId || null,
                label: additionalPrice.label,
              },
            });

            if (existingAdditionalPrice) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Additional price with label "${
                  additionalPrice.label
                }" already exists for this ${
                  additionalPrice.subProductId ? 'subproduct' : 'product'
                }`,
              );
            }

            return tx.additionalPrice.create({
              data: {
                label: additionalPrice.label,
                price: additionalPrice.price,
                productId: targetProductId,
                subProductId: additionalPrice.subProductId || null,
                shopId: additionalPrice.shopId || null,
              },
            });
          }),
        );

        // Book opening stock into the store, with its ledger entry
        if (batchData.stock > 0) {
          await tx.storeStock.upsert({
            where: {
              storeId_batchId: {
                storeId: batchData.storeId,
                batchId: productBatch.id,
              },
            },
            create: {
              storeId: batchData.storeId,
              batchId: productBatch.id,
              quantity: batchData.stock,
              status: 'Available',
              unitOfMeasureId,
            },
            update: {
              quantity: {
                increment: batchData.stock,
              },
            },
          });

          await tx.stockLedger.create({
            data: {
              batchId: productBatch.id,
              storeId: batchData.storeId,
              movementType: 'IN',
              quantity: batchData.stock,
              unitOfMeasureId,
              reference:
                batchData.reference || `BATCH-${productBatch.batchNumber}`,
              sourceType: 'OPENING_STOCK',
              sourceId: productBatch.id,
              userId,
              notes: `Initial stock creation for batch ${
                productBatch.batchNumber
              }${
                productBatch.subProductId
                  ? ` - Subproduct: ${productBatch.subProduct?.name}`
                  : ''
              }`,
              movementDate: new Date(),
            },
          });
        }

        return productBatch;
      });
    }),
  );

  return createdBatches;
};

const updateProduct = async (id, updateBody, files) => {
  console.log('=== UPDATE PRODUCT SERVICE START ===');
  console.log('Product ID:', id);
  console.log('updateBody keys:', Object.keys(updateBody || {}));
  console.log(
    'updateBody.subProducts:',
    JSON.stringify(updateBody.subProducts, null, 2),
  );
  console.log('Files keys:', Object.keys(files || {}));

  // Check if product exists
  console.log('Checking if product exists...');
  const existingProduct = await getProductById(id);
  if (!existingProduct) {
    console.log('Product not found with ID:', id);
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }
  console.log('Existing product found:', {
    id: existingProduct.id,
    productCode: existingProduct.productCode,
    name: existingProduct.name,
  });

  // Check if product code is being updated to an existing product code
  if (
    updateBody.productCode &&
    updateBody.productCode !== existingProduct.productCode
  ) {
    console.log('Product code is being changed:', {
      old: existingProduct.productCode,
      new: updateBody.productCode,
    });

    const existingProductWithCode = await getProductByCode(
      updateBody.productCode,
    );
    if (existingProductWithCode) {
      console.log('Product code already taken:', updateBody.productCode);
      throw new ApiError(httpStatus.BAD_REQUEST, 'Product code already taken');
    }
    console.log('New product code is available');
  }

  // Try to parse the data with error handling
  let parsedData;
  try {
    console.log('Calling parseFormData...');
    parsedData = parseFormData(updateBody);
    console.log('Parsed data successfully');
  } catch (error) {
    console.error('Error in parseFormData:', error);
    console.error('Error stack:', error.stack);
    // A clear message (e.g. an invalid price) is passed on as is
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid form data format');
  }

  console.log('Parsed data keys:', Object.keys(parsedData || {}));
  console.log('Parsed data:', JSON.stringify(parsedData, null, 2));

  // Ensure sellPrice has a value
  if (parsedData.sellPrice === undefined || parsedData.sellPrice === null) {
    console.log(
      'Setting sellPrice from',
      parsedData.sellPrice,
      'to',
      existingProduct.sellPrice,
    );
    parsedData.sellPrice = existingProduct.sellPrice || 0;
  }

  let { imageUrl } = existingProduct;

  // Process the product image if provided
  const imageFile = Array.isArray(files?.image) ? files.image[0] : files?.image;
  console.log('Main image file:', imageFile ? 'Present' : 'Not present');

  if (imageFile) {
    try {
      console.log('Uploading new product image...');
      imageUrl = await uploadImage(imageFile, 'product_images');
      console.log('New product image uploaded:', imageUrl);
    } catch (err) {
      console.error('Error uploading product image:', err);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Product image processing failed',
      );
    }
  } else {
    console.log('No new main image provided, keeping existing:', imageUrl);
  }

  // Process subproduct images for updates
  const subProductImages = {};
  Object.keys(files || {}).forEach((key) => {
    console.log(`Checking file key: ${key}`);
    if (key.startsWith('subproduct_image_')) {
      const index = key.replace('subproduct_image_', '');
      console.log(`Found subproduct image key: ${key} for index ${index}`);

      const file = Array.isArray(files[key]) ? files[key][0] : files[key];
      if (file) {
        subProductImages[index] = file;
        console.log(`Found subproduct image for index ${index}:`, {
          originalname: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        });
      } else {
        console.log(`No file found for key ${key}`);
      }
    }
  });

  console.log('subProductImages found:', Object.keys(subProductImages));

  const { additionalPrices, subProducts, ...productData } = parsedData;

  // Sub-products are updated in place: an entry with an id updates that
  // sub-product, an entry without one creates a new sub-product.
  const uploadedSubProductImages = {};
  if (Array.isArray(subProducts)) {
    // Every id sent must be one of this product's sub-products, once
    const existingSubProductIds = new Set(
      (existingProduct.subProducts || []).map((sp) => sp.id),
    );
    const seenIds = new Set();
    subProducts.forEach((subProductData) => {
      const subProductId = subProductData && subProductData.id;
      if (!subProductId) return;
      if (seenIds.has(subProductId)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Sub-product ${subProductId} is listed more than once`,
        );
      }
      seenIds.add(subProductId);
      if (!existingSubProductIds.has(subProductId)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Sub-product ${subProductId} does not belong to this product`,
        );
      }
    });

    // Upload subproduct images before the transaction. Files are keyed by
    // the index of the sub-product in the request (subproduct_image_<index>).
    await Promise.all(
      subProducts.map(async (_, index) => {
        if (!subProductImages[index]) return;
        try {
          uploadedSubProductImages[index] = await uploadImage(
            subProductImages[index],
            'subproduct_images',
          );
        } catch (err) {
          console.error(
            `Failed to upload subproduct image for index ${index}:`,
            err,
          );
        }
      }),
    );
  }

  console.log('Updating product with data:', productData);
  console.log('Additional prices from request:', additionalPrices);
  console.log('Product data sellPrice:', productData.sellPrice);

  // Filter out additional prices with empty/null labels
  const validAdditionalPrices = normalizeAdditionalPrices(
    additionalPrices,
    'Product',
  );

  console.log('Valid additional prices:', validAdditionalPrices);
  console.log('Valid additional prices count:', validAdditionalPrices.length);

  // Prepare the update data
  const updateData = {
    ...productData,
    imageUrl,
    // Convert string 'true'/'false' to boolean
    isActive:
      productData.isActive === 'true' ||
      productData.isActive === true ||
      productData.isActive === '1',
    // Convert sellPrice from string to number if needed
    sellPrice: productData.sellPrice
      ? parseFloat(productData.sellPrice)
      : existingProduct.sellPrice,
  };

  console.log('Update data prepared:', {
    ...updateData,
    imageUrl: updateData.imageUrl ? 'Present' : 'Empty',
    isActive: updateData.isActive,
    sellPrice: updateData.sellPrice,
  });

  // Use transaction for atomic updates
  const updatedProduct = await runStockTransaction(async (prisma) => {
    console.log('Starting database transaction for update...');

    // Handle additional prices update
    if (additionalPrices !== undefined) {
      console.log('Processing additional prices...');

      // First, delete existing additional prices for this product
      console.log('Deleting existing additional prices...');
      const deleteCount = await prisma.additionalPrice.deleteMany({
        where: { productId: id, subProductId: null },
      });
      console.log(`Deleted ${deleteCount.count} existing additional prices`);

      // Then create new ones if provided
      if (validAdditionalPrices.length > 0) {
        console.log(
          `Creating ${validAdditionalPrices.length} new additional prices`,
        );
        updateData.AdditionalPrice = {
          create: validAdditionalPrices,
        };
      } else {
        console.log('No valid additional prices to create');
      }
    } else {
      console.log('Additional prices not in update, keeping existing ones');
    }

    // Handle subproducts: update in place so sales, purchases, transfers,
    // batches and carts keep pointing at the same sub-product.
    if (subProducts && Array.isArray(subProducts)) {
      const existingSubProducts = await prisma.subProduct.findMany({
        where: { productId: id },
        select: { id: true },
      });

      const parseSubProductSellPrice = (value) => {
        if (value === undefined) return undefined;
        if (value === null || value === '') return null;
        const parsed = parseFloat(value);
        if (Number.isNaN(parsed) || parsed < 0) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Invalid sub-product sell price',
          );
        }
        return parsed;
      };

      await Promise.all(
        subProducts.map(async (rawSubProductData, index) => {
          const subProductData = rawSubProductData || {};
          const newImageUrl = uploadedSubProductImages[index];
          const sellPrice = parseSubProductSellPrice(subProductData.sellPrice);
          const ecommercePrice = parseOptionalPrice(
            subProductData.ecommercePrice,
            'sub-product e-commerce price',
          );
          // The form marks each sub-product whose price list it sends, so an
          // empty list clears them and an omitted one leaves them alone
          const sendsPrices =
            subProductData.hasAdditionalPrices !== undefined ||
            subProductData.additionalPrices !== undefined;
          const subProductPrices = sendsPrices
            ? normalizeAdditionalPrices(
                subProductData.additionalPrices,
                subProductData.name || `Subproduct ${index + 1}`,
              )
            : null;

          if (subProductData.id) {
            const data = {};
            if (subProductData.name) data.name = subProductData.name;
            if (subProductData.isActive !== undefined) {
              data.isActive =
                subProductData.isActive === 'true' ||
                subProductData.isActive === true ||
                subProductData.isActive === '1';
            }
            if (newImageUrl) data.imageUrl = newImageUrl;
            if (sellPrice !== undefined) data.sellPrice = sellPrice;
            if (ecommercePrice !== undefined) {
              data.ecommercePrice = ecommercePrice;
            }

            const updatedSubProduct = await prisma.subProduct.update({
              where: { id: subProductData.id },
              data,
            });
            if (subProductPrices) {
              await replaceSubProductPrices(
                prisma,
                id,
                updatedSubProduct.id,
                subProductPrices,
              );
            }
            return updatedSubProduct;
          }

          // New sub-product: generate unique code for it
          const subProductCode = await generateUniqueSubProductCode(
            updateData.productCode || existingProduct.productCode,
            index,
          );

          // Convert isActive from string to boolean
          const isActive =
            subProductData.isActive === 'true' ||
            subProductData.isActive === true ||
            subProductData.isActive === '1';

          const createdSubProduct = await prisma.subProduct.create({
            data: {
              name: subProductData.name || `Subproduct ${index + 1}`,
              subProductCode,
              imageUrl: newImageUrl || subProductData.imageUrl || '',
              productId: id,
              isActive,
              ...(sellPrice !== undefined && { sellPrice }),
              ...(ecommercePrice !== undefined && { ecommercePrice }),
            },
          });
          if (subProductPrices) {
            await replaceSubProductPrices(
              prisma,
              id,
              createdSubProduct.id,
              subProductPrices,
            );
          }
          return createdSubProduct;
        }),
      );

      // Sub-products left out of the request: deactivate the ones that
      // appear in any history, hard-delete only unreferenced ones.
      const keptIds = new Set(
        subProducts.map((sp) => sp && sp.id).filter(Boolean),
      );
      const removedIds = existingSubProducts
        .map((sp) => sp.id)
        .filter((spId) => !keptIds.has(spId));

      if (removedIds.length > 0) {
        const removedWithCounts = await prisma.subProduct.findMany({
          where: { id: { in: removedIds } },
          select: {
            id: true,
            _count: {
              select: {
                productBatches: true,
                purchaseItems: true,
                transferItems: true,
                stockCorrectionItems: true,
                sellItems: true,
                cartItems: true,
                sellStockCorrectionItems: true,
              },
            },
          },
        });

        const referencedIds = [];
        const unreferencedIds = [];
        removedWithCounts.forEach((sp) => {
          const { _count: counts } = sp;
          if (Object.values(counts).some((count) => count > 0)) {
            referencedIds.push(sp.id);
          } else {
            unreferencedIds.push(sp.id);
          }
        });

        if (referencedIds.length > 0) {
          await prisma.subProduct.updateMany({
            where: { id: { in: referencedIds } },
            data: { isActive: false },
          });
        }

        if (unreferencedIds.length > 0) {
          // Their additional prices go with them rather than silently
          // turning into product-level prices
          await prisma.additionalPrice.deleteMany({
            where: { subProductId: { in: unreferencedIds } },
          });
          await prisma.subProduct.deleteMany({
            where: { id: { in: unreferencedIds } },
          });
        }
      }
    }

    // Update the main product
    console.log('Updating main product in database...');
    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        subCategory: true,
        subProducts: true,
        unitOfMeasure: true,
        AdditionalPrice: true,
      },
    });

    console.log('Product updated successfully with ID:', product.id);
    return product;
  });

  console.log('=== UPDATE PRODUCT SERVICE END ===');
  return updatedProduct;
};

const deleteProduct = async (id) => {
  const existingProduct = await getProductById(id);
  if (!existingProduct) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }

  // Sub-products no longer cascade and history rows restrict deletes, so
  // check everything up front and delete in one transaction (all or nothing)
  await runStockTransaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            PurchaseItem: true,
            TransferItem: true,
            StockCorrectionItem: true,
            SellItem: true,
            SellStockCorrectionItem: true,
            CartItem: true,
            waitlists: true,
          },
        },
        batches: {
          select: {
            id: true,
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
        },
      },
    });
    if (!product) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    }

    const hasStock = product.batches.some(
      (batch) =>
        batch.StoreStock.some((s) => s.quantity > 0) ||
        batch.ShopStock.some((s) => s.quantity > 0),
    );
    if (hasStock) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot delete a product that still has stock in a store or shop. Deactivate it instead.',
      );
    }

    const { CartItem, waitlists, ...historyCounts } = product._count;
    const hasHistory =
      Object.values(historyCounts).some((count) => count > 0) ||
      product.batches.some((batch) =>
        Object.values(batch._count).some((count) => count > 0),
      );
    if (hasHistory) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot delete a product with purchase, sale, transfer or stock history. Deactivate it instead.',
      );
    }

    if (CartItem > 0 || waitlists > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot delete a product that is in customer carts or waitlists. Deactivate it instead.',
      );
    }

    const batchIds = product.batches.map((batch) => batch.id);

    await tx.additionalPrice.deleteMany({ where: { productId: id } });
    if (batchIds.length > 0) {
      // Only empty stock rows can remain here (checked above)
      await tx.storeStock.deleteMany({ where: { batchId: { in: batchIds } } });
      await tx.shopStock.deleteMany({ where: { batchId: { in: batchIds } } });
      await tx.productBatch.deleteMany({ where: { id: { in: batchIds } } });
    }
    await tx.subProduct.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });

  return { message: 'Product deleted successfully' };
};
const getProductBatchByBatchNumber = async (batchNumber) => {
  const batch = await prisma.productBatch.findFirst({
    where: {
      batchNumber,
    },
  });
  return !!batch;
};
// Registers a batch only: it books no StoreStock and no ledger row, so the
// batch always starts with stock 0 (opening stock goes through
// createProductBatch, which books it into a store). Only whitelisted fields
// are taken from the body.
const createProductBatchsingle = async (productBatchBody) => {
  const { productId, subProductId, batchNumber, expiryDate, price, storeId } =
    productBatchBody || {};

  if (!batchNumber) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Batch number is required');
  }

  // Check if product batch with same batch number already exists
  if (await getProductBatchByBatchNumber(batchNumber)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Batch number already exists');
  }

  // Validate that the product exists
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

  let expiryDateISO;
  if (expiryDate) {
    const parsedExpiry = new Date(expiryDate);
    if (Number.isNaN(parsedExpiry.getTime())) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid expiry date');
    }
    expiryDateISO = parsedExpiry.toISOString();
  }

  let batchPrice;
  if (price !== undefined && price !== null && price !== '') {
    batchPrice = parseFloat(price);
    if (Number.isNaN(batchPrice) || batchPrice < 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid batch price');
    }
  }

  const productBatch = await prisma.productBatch.create({
    data: {
      productId,
      subProductId: subProductId || null,
      batchNumber,
      expiryDate: expiryDateISO,
      price: batchPrice,
      storeId: storeId || null,
    },
  });

  return productBatch;
};
const getProductDetails = async (productId, userId) => {
  try {
    // Get the user's accessible shops and stores (admins: all of them)
    const locations = await getAccessibleLocations(userId);

    if (!locations) {
      throw new Error('User not found');
    }

    const accessibleShopIds = locations.shopIds;
    const accessibleStoreIds = locations.storeIds;

    // A user with no shops or stores still sees the product, just with no
    // stock: the `in: []` filters below match nothing.
    const shopStockWhere =
      accessibleShopIds.length > 0
        ? { status: 'Available', shopId: { in: accessibleShopIds } }
        : { status: 'Available', shopId: { in: [] } };

    const storeStockWhere =
      accessibleStoreIds.length > 0
        ? { status: 'Available', storeId: { in: accessibleStoreIds } }
        : { status: 'Available', storeId: { in: [] } };

    // Get the product with related data
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        subProducts: true,

        subCategory: {
          select: {
            id: true,
            name: true,
          },
        },
        unitOfMeasure: true,
        AdditionalPrice: {
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
        batches: {
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

    if (!product) {
      throw new Error('Product not found');
    }
    const additionalPrices = await prisma.additionalPrice.findMany({
      where: {
        productId,
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
    // Get stock ledger entries for this product (filtered by accessible shops/stores)
    const stockLedgers = await prisma.stockLedger.findMany({
      where: {
        batch: {
          productId,
        },
        OR: [
          { storeId: { in: accessibleStoreIds } },
          { shopId: { in: accessibleShopIds } },
        ],
      },
      include: {
        batch: true,
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
    const ledgerSaleInfo = await loadLedgerSaleInfo(stockLedgers);

    // Calculate total quantities across accessible stores and shops
    const storeStocks = await prisma.storeStock.groupBy({
      by: ['storeId'],
      where: {
        batch: {
          productId,
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
          productId,
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
    const processedBatches = product.batches.map((batch) => {
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
        subProductId: batch.subProductId,
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
    const toPriceView = (price) => ({
      id: price.id,
      label: price.label,
      price: price.price,
      shopId: price.shopId,
      shopName: price.shop?.name,
      branchId: price.shop?.branch?.id,
      branchName: price.shop?.branch?.name,
    });
    const visiblePrices = product.AdditionalPrice.filter(
      (price) => !price.shopId || accessibleShopIds.includes(price.shopId),
    );
    // Product-level prices only; sub-product prices are listed with each sub-product
    const processedAdditionalPrices = visiblePrices
      .filter((price) => !price.subProductId)
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
      // Set on sale / sale-correction rows: customer, salesperson, unit price
      sale: ledgerSaleInfo.get(ledger.id)?.sale ?? null,
      unitPrice: ledgerSaleInfo.get(ledger.id)?.unitPrice ?? null,
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

    // Each sub-product with its own prices and the stock of its own batches
    const processedSubProducts = (product.subProducts || []).map((sp) => {
      const spBatches = processedBatches.filter(
        (batch) => batch.subProductId === sp.id,
      );
      const storeQuantity = spBatches.reduce(
        (total, batch) => total + batch.batchStoreQuantity,
        0,
      );
      const shopQuantity = spBatches.reduce(
        (total, batch) => total + batch.batchShopQuantity,
        0,
      );
      return {
        id: sp.id,
        name: sp.name,
        subProductCode: sp.subProductCode,
        imageUrl: sp.imageUrl,
        isActive: sp.isActive,
        sellPrice: sp.sellPrice,
        ecommercePrice: sp.ecommercePrice,
        additionalPrices: visiblePrices
          .filter((price) => price.subProductId === sp.id)
          .map(toPriceView),
        stock: {
          storeQuantity,
          shopQuantity,
          totalQuantity: storeQuantity + shopQuantity,
          batchCount: spBatches.length,
        },
        createdAt: sp.createdAt,
        updatedAt: sp.updatedAt,
      };
    });

    return {
      product: {
        id: product.id,
        productCode: product.productCode,
        name: product.name,
        generic: product.generic,
        description: product.description,
        sellPrice: product.sellPrice,
        ecommercePrice: product.ecommercePrice,
        warningQuantity: product.warningQuantity,
        imageUrl: product.imageUrl,
        category: product.category,
        subCategory: product.subCategory,
        unitOfMeasure: product.unitOfMeasure,
        isActive: product.isActive,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
      subProducts: processedSubProducts,
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
    console.error('Error in getProductDetails:', error);
    throw error;
  }
};
// shopIds: when given, only stock in those shops is counted (per-user views).
const getProductBatchesByShops = async (
  productId,
  subProductId = null,
  shopIds = null,
) => {
  // First, check if the product has subproducts
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      subProducts: {
        where: { isActive: true },
      },
    },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  const hasSubProducts = product.subProducts && product.subProducts.length > 0;

  // If product has subproducts but no subProductId provided, return product info without stock
  if (hasSubProducts && !subProductId) {
    return {
      id: product.id,
      name: product.name,
      productCode: product.productCode,
      hasSubProducts: true,
      subProducts: product.subProducts.map((sp) => ({
        id: sp.id,
        name: sp.name,
        subProductCode: sp.subProductCode,
        imageUrl: sp.imageUrl,
        isActive: sp.isActive,
      })),
      message: 'Please select a subproduct to check availability',
    };
  }

  // Determine which product ID to use for stock lookup
  const targetProductId = subProductId || productId;
  const isSubProduct = !!subProductId;

  // Get all available shop stocks for the product/subproduct
  const shopStocks = await prisma.shopStock.findMany({
    where: {
      batch: {
        ...(isSubProduct
          ? { subProductId: targetProductId }
          : { productId: targetProductId }),
      },
      ...(shopIds && { shopId: { in: shopIds } }),
      status: 'Available',
      quantity: {
        gt: 0,
      },
    },
    include: {
      shop: {
        include: {
          branch: true,
        },
      },
      batch: {
        include: {
          product: {
            include: {
              AdditionalPrice: {
                where: {
                  OR: [
                    { shopId: null }, // Global additional prices
                    { shopId: { not: null } }, // Shop-specific additional prices
                  ],
                },
              },
            },
          },
          subProduct: true,
        },
      },
    },
  });

  if (!shopStocks || shopStocks.length === 0) {
    // Return empty stock info but with product details
    return {
      ...(isSubProduct
        ? {
            subProduct: await prisma.subProduct.findUnique({
              where: { id: targetProductId },
              include: { product: true },
            }),
          }
        : { product }),
      totalAvailableQuantity: 0,
      shops: [],
      hasStock: false,
      message: 'No available stock found in any shop',
    };
  }

  // Get all pending/approved sells that affect stock availability
  const pendingSells = await prisma.sell.findMany({
    where: {
      items: {
        some: {
          ...(isSubProduct
            ? { subProductId: targetProductId }
            : { productId: targetProductId }),
        },
      },
      saleStatus: {
        in: ['APPROVED', 'PARTIALLY_DELIVERED'],
      },
    },
    include: {
      items: {
        where: {
          ...(isSubProduct
            ? { subProductId: targetProductId }
            : { productId: targetProductId }),
          itemSaleStatus: 'PENDING',
        },
        include: {
          shop: true,
        },
      },
    },
  });

  // Calculate reserved quantities by shop
  const reservedQuantitiesByShop = new Map();

  pendingSells.forEach((sell) => {
    sell.items.forEach((item) => {
      const itemMatches = isSubProduct
        ? item.subProductId === targetProductId
        : item.productId === targetProductId;

      if (itemMatches && item.itemSaleStatus === 'PENDING') {
        const currentReserved = reservedQuantitiesByShop.get(item.shopId) || 0;
        reservedQuantitiesByShop.set(
          item.shopId,
          currentReserved + item.quantity,
        );
      }
    });
  });

  // Aggregate quantities by shop and collect additional prices
  const shopsMap = new Map();
  let totalAvailableQuantity = 0;

  shopStocks.forEach((stock) => {
    const reservedQuantity = reservedQuantitiesByShop.get(stock.shopId) || 0;
    const netAvailableQuantity = Math.max(0, stock.quantity - reservedQuantity);

    totalAvailableQuantity += netAvailableQuantity;

    if (shopsMap.has(stock.shop.id)) {
      const existingShop = shopsMap.get(stock.shop.id);
      existingShop.quantity += netAvailableQuantity;
    } else {
      // Base price: the sub-product's own price if set, otherwise the product's
      const rawBasePrice =
        stock.batch.subProduct?.sellPrice ?? stock.batch.product.sellPrice;
      const basePrice =
        rawBasePrice === null || rawBasePrice === undefined
          ? null
          : Number(rawBasePrice);

      // Filter additional prices for this specific shop and subproduct/product
      const shopAdditionalPrices = stock.batch.product.AdditionalPrice.filter(
        (ap) => {
          const matchesShop = ap.shopId === null || ap.shopId === stock.shop.id;
          const matchesSubProduct = isSubProduct
            ? ap.subProductId === targetProductId || ap.subProductId === null
            : ap.subProductId === null;
          return matchesShop && matchesSubProduct;
        },
      );

      // Calculate total price (base + sum of additional prices)
      let totalPrice = null;
      if (basePrice) {
        const base = parseFloat(basePrice.toString());
        const additionalTotal = shopAdditionalPrices.reduce(
          (sum, ap) => sum + ap.price,
          0,
        );
        totalPrice = base + additionalTotal;
      }

      shopsMap.set(stock.shop.id, {
        shopId: stock.shop.id,
        shopName: stock.shop.name,
        branchName: stock.shop.branch?.name,
        quantity: netAvailableQuantity,
        unitOfMeasure: stock.unitOfMeasure,
        batchInfo: {
          batchId: stock.batch.id,
          batchNo: stock.batch.batchNo,
          expiryDate: stock.batch.expiryDate,
          manufacturingDate: stock.batch.manufacturingDate,
        },
        basePrice,
        additionalPrices: shopAdditionalPrices.map((ap) => ({
          id: ap.id,
          label: ap.label,
          price: ap.price,
          isGlobal: ap.shopId === null,
          ...(isSubProduct && { subProductId: ap.subProductId }),
        })),
        totalPrice,
      });
    }
  });

  // Prepare response based on whether it's a product or subproduct
  const response = {
    totalAvailableQuantity,
    shops: Array.from(shopsMap.values()),
    hasStock: totalAvailableQuantity > 0,
  };

  if (isSubProduct) {
    const subProduct = await prisma.subProduct.findUnique({
      where: { id: targetProductId },
      include: { product: true },
    });
    return {
      ...response,
      subProduct: {
        id: subProduct.id,
        name: subProduct.name,
        subProductCode: subProduct.subProductCode,
        imageUrl: subProduct.imageUrl,
        productId: subProduct.productId,
        productName: subProduct.product.name,
      },
    };
  }

  // Return for product (no subproduct)
  return {
    ...response,
    product: {
      id: product.id,
      name: product.name,
      productCode: product.productCode,
      hasSubProducts,
      ...(hasSubProducts && {
        subProducts: product.subProducts.map((sp) => ({
          id: sp.id,
          name: sp.name,
          subProductCode: sp.subProductCode,
          imageUrl: sp.imageUrl,
        })),
      }),
    },
  };
};

const getRandomProductsWithShopStocks = async (userId = null) => {
  // Get user's accessible shops if userId is provided
  let userAccessibleShopIds = [];

  if (userId) {
    const locations = await getAccessibleLocations(userId);
    userAccessibleShopIds = locations?.shopIds || [];
  }

  // Build the shop filter condition
  const shopFilterCondition = userId
    ? {
        shopId:
          userAccessibleShopIds.length > 0
            ? { in: userAccessibleShopIds }
            : { in: [] }, // Empty array returns no results
      }
    : {}; // No user ID = show all shops

  // Get random products that have batches in shops with available stock
  const productsWithShopStocks = await prisma.product.findMany({
    where: {
      isActive: true,
      batches: {
        some: {
          ShopStock: {
            some: {
              quantity: { gt: 0 },
              ...shopFilterCondition,
            },
          },
        },
      },
    },
    include: {
      category: true,
      subCategory: true,
      subProducts: true,

      unitOfMeasure: true,
      AdditionalPrice: {
        include: {
          shop: {
            include: {
              branch: true,
            },
          },
        },
      },
      batches: {
        where: {
          ShopStock: {
            some: {
              quantity: { gt: 0 },
              ...shopFilterCondition,
            },
          },
        },
        select: {
          ShopStock: {
            where: {
              quantity: { gt: 0 },
              ...shopFilterCondition,
            },
            select: {
              quantity: true,
              shop: {
                include: {
                  branch: true,
                },
              },
              unitOfMeasure: true,
            },
          },
        },
      },
    },
    take: 20,
  });

  // Format the response...
  const formattedProducts = productsWithShopStocks.map((product) => {
    // Calculate total available quantity across all batches and shops
    // Filter additional prices based on user shop access
    const additionalPrices = product.AdditionalPrice.filter(
      (price) =>
        !userId || // No user = show all
        (userAccessibleShopIds.length > 0 &&
          userAccessibleShopIds.includes(price.shopId)), // User with shops = only assigned shops
      // If userAccessibleShopIds is empty, no additional prices will be shown
    ).map((price) => ({
      id: price.id,
      label: price.label,
      price: price.price,
      shopId: price.shopId,
      shop: price.shop
        ? {
            id: price.shop.id,
            name: price.shop.name,
            branch: price.shop.branch
              ? {
                  id: price.shop.branch.id,
                  name: price.shop.branch.name,
                }
              : null,
          }
        : null,
      createdAt: price.createdAt,
      updatedAt: price.updatedAt,
    }));

    // Create the final product object
    const finalProduct = {
      id: product.id,
      productCode: product.productCode,
      name: product.name,
      generic: product.generic,
      description: product.description,
      sellPrice: product.sellPrice,
      imageUrl: product.imageUrl,
      category: product.category,
      subCategory: product.subCategory,
      unitOfMeasure: product.unitOfMeasure,
      isActive: product.isActive,
      additionalPrices,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };

    return {
      product: finalProduct,
    };
  });

  return {
    products: formattedProducts,
    count: formattedProducts.length,
    note: 'Random products with available shop stock (no top-selling products found)',
  };
};
function processProductResults(products) {
  const productResults = products.map((product) => {
    // Filter out batches that have no shop stocks after the query

    // Process additional prices
    const additionalPrices = product.AdditionalPrice.map((price) => ({
      id: price.id,
      label: price.label,
      price: price.price,
      shopId: price.shopId,
      shop: price.shop
        ? {
            id: price.shop.id,
            name: price.shop.name,
            branch: price.shop.branch
              ? {
                  id: price.shop.branch.id,
                  name: price.shop.branch.name,
                }
              : null,
          }
        : null,
      createdAt: price.createdAt,
      updatedAt: price.updatedAt,
    }));

    return {
      product: {
        id: product.id,
        productCode: product.productCode,
        name: product.name,
        generic: product.generic,
        description: product.description,
        category: product.category,
        subCategory: product.subCategory,
        unitOfMeasure: product.unitOfMeasure,
        sellPrice: product.sellPrice,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
        additionalPrices,
      },
      // Removed batches array from here
    };
  });

  return {
    products: productResults,
    count: productResults.length,
  };
}

// Helper function to check if string is a valid UUID
function isValidUUID(str) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

const searchProducts = async (
  searchTerm,
  categoryFilter = null,
  subCategoryFilter = null,
) => {
  let categoryId = null;
  let subCategoryIds = []; // Changed to array to handle multiple subcategories with same name

  console.log('🔍 searchProducts called with:', {
    searchTerm,
    categoryFilter,
    subCategoryFilter,
  });

  // Handle category filter (could be ID or name)
  if (categoryFilter) {
    if (isValidUUID(categoryFilter)) {
      // It's a UUID, use as ID
      categoryId = categoryFilter;
      console.log('📦 Using categoryFilter as UUID:', categoryId);
    } else {
      // It's a name, look up the ID
      console.log('🔎 Looking up category by name:', categoryFilter);
      const category = await prisma.category.findFirst({
        where: { name: categoryFilter },
        select: { id: true },
      });
      if (category) {
        categoryId = category.id;
        console.log('✅ Found category ID:', categoryId);
      } else {
        console.log('❌ Category not found:', categoryFilter);
        return {
          products: [],
          count: 0,
          note: 'Category not found',
        };
      }
    }
  }

  // Handle subcategory filter (could be ID or name)
  if (subCategoryFilter) {
    if (isValidUUID(subCategoryFilter)) {
      // It's a UUID, use as ID
      subCategoryIds = [subCategoryFilter];
      console.log('📦 Using subCategoryFilter as UUID:', subCategoryIds);
    } else {
      // It's a name, look up ALL subcategories with this name
      const subCategoryWhere = {
        name: subCategoryFilter,
      };

      console.log('🔎 Looking up subcategory by name:', subCategoryFilter);
      console.log('📝 Current categoryId:', categoryId);

      // Only filter by category if category is specified
      if (categoryId) {
        subCategoryWhere.categoryId = categoryId;
        console.log('➕ Added category filter to subcategory search');
      }

      const subCategories = await prisma.subCategory.findMany({
        where: subCategoryWhere,
        select: { id: true, name: true, categoryId: true },
      });

      console.log('📊 Found subcategories:', subCategories);

      if (subCategories.length > 0) {
        subCategoryIds = subCategories.map((subCat) => subCat.id);
        console.log('✅ Subcategory IDs found:', subCategoryIds);
      } else {
        console.log('❌ No subcategories found with name:', subCategoryFilter);
        return {
          products: [],
          count: 0,
          note: 'Subcategory not found',
        };
      }
    }
  }

  console.log('🎯 Final filters:', {
    categoryId,
    subCategoryIds,
    subCategoryCount: subCategoryIds.length,
  });

  // Add debug logging to see what's being searched
  // First, get all products and filter manually for case-insensitive search
  const allProducts = await prisma.product.findMany({
    where: {
      isActive: true,
      // Apply category filter if provided
      ...(categoryId && { categoryId }),
      // Apply subcategory filter if provided - now can be multiple IDs
      ...(subCategoryIds.length > 0 && {
        subCategoryId: { in: subCategoryIds },
      }),
    },
    include: {
      category: true,
      subCategory: true,
      unitOfMeasure: true,
      AdditionalPrice: {
        include: {
          shop: {
            include: {
              branch: true,
            },
          },
        },
      },
      batches: {
        where: {
          ShopStock: {
            some: {
              quantity: { gt: 0 },
            },
          },
        },
        include: {
          ShopStock: {
            where: {
              quantity: { gt: 0 },
            },
            include: {
              shop: {
                include: {
                  branch: true,
                },
              },
              unitOfMeasure: true,
            },
          },
        },
      },
    },
  });

  console.log(
    '📦 Total products fetched (before search term filter):',
    allProducts.length,
  );

  // Log sample products to check their structure
  if (allProducts.length > 0) {
    console.log('📋 Sample product structure:', {
      id: allProducts[0].id,
      name: allProducts[0].name,
      category: allProducts[0].category?.name,
      subCategory: allProducts[0].subCategory?.name,
      categoryId: allProducts[0].categoryId,
      subCategoryId: allProducts[0].subCategoryId,
    });
  }

  // If no search term, return all filtered products
  if (!searchTerm) {
    console.log('🔍 No search term provided, returning all filtered products');
    return processProductResults(allProducts);
  }

  console.log('🔎 Applying search term:', searchTerm);

  // Manual case-insensitive filtering with multiple field support
  const searchTermLower = searchTerm.toLowerCase().trim();

  const filteredProducts = allProducts.filter((product) => {
    // Check product name
    const nameMatch = product.name.toLowerCase().includes(searchTermLower);

    // Check generic name - handle comma-separated values
    let genericMatch = false;
    if (product.generic) {
      // Split by commas and check each generic term
      const genericTerms = product.generic
        .toLowerCase()
        .split(',')
        .map((term) => term.trim());
      genericMatch = genericTerms.some((term) =>
        term.includes(searchTermLower),
      );
    }

    // Check product code
    const codeMatch = product.productCode
      .toLowerCase()
      .includes(searchTermLower);

    // Check category name (case-insensitive)
    const categoryMatch = product.category?.name
      .toLowerCase()
      .includes(searchTermLower);

    // Check subcategory name (case-insensitive)
    const subCategoryMatch = product.subCategory?.name
      .toLowerCase()
      .includes(searchTermLower);

    const matches =
      nameMatch ||
      genericMatch ||
      codeMatch ||
      categoryMatch ||
      subCategoryMatch;

    return matches;
  });

  console.log(
    '✅ Products after search term filtering:',
    filteredProducts.length,
  );

  return processProductResults(filteredProducts);
};

const getTopSellingProducts = async (
  userId = null,
  searchTerm = null,
  categoryName = null,
  subCategoryName = null,
) => {
  let categoryId = null;
  let subCategoryIds = [];

  console.log('🏆 getTopSellingProducts called with:', {
    userId,
    searchTerm,
    categoryName,
    subCategoryName,
  });

  // If category name is provided, find the category ID
  if (categoryName) {
    console.log('🔎 Looking up category by name:', categoryName);
    const category = await prisma.category.findFirst({
      where: {
        name: categoryName,
      },
      select: { id: true },
    });
    if (category) {
      categoryId = category.id;
      console.log('✅ Found category ID:', categoryId);
    } else {
      console.log('❌ Category not found:', categoryName);
      return {
        products: [],
        count: 0,
        note: 'Category not found',
      };
    }
  }

  // If subcategory name is provided, find ALL subcategory IDs with that name
  if (subCategoryName) {
    const subCategoryWhere = {
      name: subCategoryName,
    };

    console.log('🔎 Looking up subcategory by name:', subCategoryName);
    console.log('📝 Current categoryId:', categoryId);

    // Only filter by category if category is also specified
    if (categoryId) {
      subCategoryWhere.categoryId = categoryId;
      console.log('➕ Added category filter to subcategory search');
    }

    const subCategories = await prisma.subCategory.findMany({
      where: subCategoryWhere,
      select: { id: true, name: true, categoryId: true },
    });

    console.log('📊 Found subcategories:', subCategories);

    if (subCategories.length > 0) {
      subCategoryIds = subCategories.map((subCat) => subCat.id);
      console.log('✅ Subcategory IDs found:', subCategoryIds);
    } else {
      console.log('❌ No subcategories found with name:', subCategoryName);
      return {
        products: [],
        count: 0,
        note: 'Subcategory not found',
      };
    }
  }

  console.log('🎯 Final filters for top selling:', {
    categoryId,
    subCategoryIds,
    subCategoryCount: subCategoryIds.length,
  });

  // If search term is provided, use search functionality
  if (searchTerm) {
    console.log('🔍 Search term provided, delegating to searchProducts');
    return searchProducts(searchTerm, categoryId, subCategoryName);
  }

  // Get user's accessible shops if userId is provided
  let userAccessibleShopIds = [];
  if (userId) {
    console.log('👤 Getting accessible shops for user:', userId);
    const locations = await getAccessibleLocations(userId);
    userAccessibleShopIds = locations?.shopIds || [];
    console.log('🏪 User accessible shop IDs:', userAccessibleShopIds);
  }

  // Build the shop filter condition
  const shopFilterCondition = userId
    ? {
        shopId:
          userAccessibleShopIds.length > 0
            ? { in: userAccessibleShopIds }
            : { in: [] },
      }
    : {};

  console.log(
    '📈 Getting top selling products from sell items WITH category/subcategory filter...',
  );

  // First, get product IDs in the filtered category/subcategory
  let productIdsInFilter = [];

  if (categoryId || subCategoryIds.length > 0) {
    const productWhere = {
      isActive: true,
    };

    if (categoryId) {
      productWhere.categoryId = categoryId;
    }

    if (subCategoryIds.length > 0) {
      productWhere.subCategoryId = { in: subCategoryIds };
    }

    const productsInFilter = await prisma.product.findMany({
      where: productWhere,
      select: { id: true },
    });
    productIdsInFilter = productsInFilter.map((p) => p.id);
    console.log('📋 Product IDs in filter:', productIdsInFilter.length);

    if (productIdsInFilter.length === 0) {
      console.log('⚠️ No products found in the specified category/subcategory');
      return {
        products: [],
        count: 0,
        note: 'No products found in the specified category/subcategory',
      };
    }
  }

  // Now get top selling products, filtered by category/subcategory if specified
  const topSellingProducts = await prisma.sellItem.groupBy({
    by: ['productId'],
    where: {
      // Only include completed/delivered sales
      OR: [
        { itemSaleStatus: 'DELIVERED' },
        {
          sell: {
            saleStatus: {
              in: ['DELIVERED', 'APPROVED', 'PARTIALLY_DELIVERED'],
            },
          },
        },
      ],
      // Apply category/subcategory filter if specified
      ...((categoryId || subCategoryIds.length > 0) && {
        productId: { in: productIdsInFilter },
      }),
    },
    _sum: {
      quantity: true,
      totalPrice: true,
    },
    _count: {
      id: true,
    },
    orderBy: {
      _sum: {
        quantity: 'desc',
      },
    },
    take: 20,
  });

  console.log(
    '📊 Top selling product IDs (filtered by category/subcategory):',
    topSellingProducts.map((item) => item.productId),
  );

  // If no top selling products found in the filter, get random products from that filter
  if (topSellingProducts.length === 0) {
    console.log(
      '⚠️ No top selling products found in filter, getting random products from filter',
    );

    // Get random products from the specified category/subcategory with subproduct details
    const randomProducts = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(categoryId && { categoryId }),
        ...(subCategoryIds.length > 0 && {
          subCategoryId: { in: subCategoryIds },
        }),
      },
      take: 20,
      include: {
        category: true,
        subCategory: true,
        unitOfMeasure: true,
        subProducts: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            imageUrl: true,
            subProductCode: true,
          },
        },
        AdditionalPrice: {
          include: {
            shop: {
              include: {
                branch: true,
              },
            },
          },
        },
        batches: {
          where: {
            ShopStock: {
              some: {
                quantity: { gt: 0 },
                ...shopFilterCondition,
              },
            },
          },
          select: {
            ShopStock: {
              where: {
                quantity: { gt: 0 },
                ...shopFilterCondition,
              },
              select: {
                quantity: true,
                shop: {
                  include: {
                    branch: true,
                  },
                },
                unitOfMeasure: true,
              },
            },
          },
        },
      },
    });

    // Format the random products with subproduct details
    const formattedProducts = randomProducts.map((product) => {
      // Filter additional prices based on user shop access
      const additionalPrices = product.AdditionalPrice.filter(
        (price) =>
          !userId || // No user = show all
          (userAccessibleShopIds.length > 0 &&
            userAccessibleShopIds.includes(price.shopId)), // User with shops = only assigned shops
      ).map((price) => ({
        id: price.id,
        label: price.label,
        price: price.price,
        shopId: price.shopId,
        shop: price.shop
          ? {
              id: price.shop.id,
              name: price.shop.name,
              branch: price.shop.branch
                ? {
                    id: price.shop.branch.id,
                    name: price.shop.branch.name,
                  }
                : null,
            }
          : null,
        createdAt: price.createdAt,
        updatedAt: price.updatedAt,
      }));

      // Create the final product object with subproduct details
      const finalProduct = {
        id: product.id,
        productCode: product.productCode,
        name: product.name,
        generic: product.generic,
        description: product.description,
        sellPrice: product.sellPrice,
        warningQuantity: product.warningQuantity,
        imageUrl: product.imageUrl,
        category: product.category,
        subCategory: product.subCategory,
        unitOfMeasure: product.unitOfMeasure,
        isActive: product.isActive,
        additionalPrices,
        subProducts: product.subProducts || [], // 👈 Added subproducts with name and image
        subProductCount: product.subProducts?.length || 0,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };

      return {
        product: finalProduct,
      };
    });

    return {
      products: formattedProducts,
      count: formattedProducts.length,
      note: 'Random products from specified category/subcategory (no top sellers found)',
    };
  }

  // Get product IDs from top selling products
  const productIds = topSellingProducts.map((item) => item.productId);

  // Build where clause for products
  const productWhereClause = {
    id: { in: productIds },
    isActive: true,
  };

  // Add category filter if found (though it should already be included from the sellItem filter)
  if (categoryId) {
    productWhereClause.categoryId = categoryId;
  }

  console.log('🎯 Product where clause:', productWhereClause);

  // Get products with their additional prices, shop availability, and subproducts
  const productsWithDetails = await prisma.product.findMany({
    where: productWhereClause,
    include: {
      category: true,
      subCategory: true,
      subProducts: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          subProductCode: true,
        },
      },
      unitOfMeasure: true,
      AdditionalPrice: {
        include: {
          shop: {
            include: {
              branch: true,
            },
          },
        },
      },
      batches: {
        where: {
          ShopStock: {
            some: {
              quantity: { gt: 0 },
              ...shopFilterCondition,
            },
          },
        },
        select: {
          ShopStock: {
            where: {
              quantity: { gt: 0 },
              ...shopFilterCondition,
            },
            select: {
              quantity: true,
              shop: {
                include: {
                  branch: true,
                },
              },
              unitOfMeasure: true,
            },
          },
        },
      },
    },
  });

  console.log('📦 Products with details found:', productsWithDetails.length);

  // Format the response with subproduct details
  const formattedProducts = productsWithDetails.map((product) => {
    // Filter additional prices based on user shop access
    const additionalPrices = product.AdditionalPrice.filter(
      (price) =>
        !userId || // No user = show all
        (userAccessibleShopIds.length > 0 &&
          userAccessibleShopIds.includes(price.shopId)), // User with shops = only assigned shops
    ).map((price) => ({
      id: price.id,
      label: price.label,
      price: price.price,
      shopId: price.shopId,
      shop: price.shop
        ? {
            id: price.shop.id,
            name: price.shop.name,
            branch: price.shop.branch
              ? {
                  id: price.shop.branch.id,
                  name: price.shop.branch.name,
                }
              : null,
          }
        : null,
      createdAt: price.createdAt,
      updatedAt: price.updatedAt,
    }));

    // Create the final product object with subproduct details
    const finalProduct = {
      id: product.id,
      productCode: product.productCode,
      name: product.name,
      generic: product.generic,
      description: product.description,
      sellPrice: product.sellPrice,
      imageUrl: product.imageUrl,
      category: product.category,
      subCategory: product.subCategory,
      unitOfMeasure: product.unitOfMeasure,
      isActive: product.isActive,
      additionalPrices,
      subProducts: product.subProducts || [], // 👈 Added subproducts with name and image
      subProductCount: product.subProducts?.length || 0,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };

    return {
      product: finalProduct,
    };
  });

  // Sort by sales quantity and take top 20
  const topProducts = formattedProducts
    .sort(
      (a, b) =>
        (b.salesData?.totalQuantitySold || 0) -
        (a.salesData?.totalQuantitySold || 0),
    )
    .slice(0, 20);

  console.log('✅ Final top products count:', topProducts.length);

  return {
    products: topProducts,
    count: topProducts.length,
    note: 'Top selling products with available shop stock',
  };
};

const getProductBatchesByShopsUser = async (productId, userId = null) => {
  // If userId is provided, get user's accessible shops first
  let userShopIds = [];
  if (userId) {
    const locations = await getAccessibleLocations(userId);

    if (!locations) {
      throw new Error('User not found');
    }

    userShopIds = locations.shopIds;

    // If user has no shop access, return empty result
    if (userShopIds.length === 0) {
      return {
        totalAvailableQuantity: 0,
        shops: [],
        hasStock: false,
        _metadata: {
          totalShops: 0,
          accessibleShops: 0,
          hasRestrictedAccess: false,
          message: 'User has no shop access',
        },
      };
    }
  }

  // Build where clause for shop stocks
  const shopStockWhere = {
    batch: {
      productId,
    },
    status: 'Available',
    quantity: {
      gt: 0,
    },
  };

  // If userId is provided, filter by user's accessible shops
  if (userId && userShopIds.length > 0) {
    shopStockWhere.shopId = {
      in: userShopIds,
    };
  }

  // Get all available shop stocks for the product
  const shopStocks = await prisma.shopStock.findMany({
    where: shopStockWhere,
    include: {
      shop: {
        include: {
          branch: true,
        },
      },
      batch: {
        include: {
          product: {
            include: {
              AdditionalPrice: {
                where: {
                  OR: [
                    { shopId: null }, // Global additional prices
                    { shopId: { not: null } }, // Shop-specific additional prices
                  ],
                },
              },
            },
          },
        },
      },
    },
  });

  if (!shopStocks || shopStocks.length === 0) {
    return {
      totalAvailableQuantity: 0,
      shops: [],
      hasStock: false,
      _metadata: {
        totalShops: 0,
        accessibleShops: 0,
        hasRestrictedAccess: false,
        message:
          'No available stock found for this product in accessible shops',
      },
    };
  }

  // Get shop IDs from the fetched stocks for reservation calculation
  const stockShopIds = [...new Set(shopStocks.map((stock) => stock.shopId))];

  // Get all pending/approved sells that affect stock availability in accessible shops
  const pendingSells = await prisma.sell.findMany({
    where: {
      items: {
        some: {
          productId,
          shopId: {
            in: stockShopIds,
          },
        },
      },
      saleStatus: {
        in: ['APPROVED', 'PARTIALLY_DELIVERED'], // Only consider approved and partially delivered sells
      },
    },
    include: {
      items: {
        where: {
          productId,
          shopId: {
            in: stockShopIds,
          },
          itemSaleStatus: 'PENDING', // Only consider pending items (not yet delivered)
        },
        include: {
          shop: true,
        },
      },
    },
  });

  // Calculate reserved quantities by shop (only for accessible shops)
  const reservedQuantitiesByShop = new Map();

  pendingSells.forEach((sell) => {
    sell.items.forEach((item) => {
      if (
        item.productId === productId &&
        item.itemSaleStatus === 'PENDING' &&
        stockShopIds.includes(item.shopId)
      ) {
        const currentReserved = reservedQuantitiesByShop.get(item.shopId) || 0;
        reservedQuantitiesByShop.set(
          item.shopId,
          currentReserved + item.quantity,
        );
      }
    });
  });

  // Aggregate quantities by shop and collect additional prices
  const shopsMap = new Map();
  let totalAvailableQuantity = 0;

  shopStocks.forEach((stock) => {
    const reservedQuantity = reservedQuantitiesByShop.get(stock.shopId) || 0;
    const netAvailableQuantity = Math.max(0, stock.quantity - reservedQuantity);

    totalAvailableQuantity += netAvailableQuantity;

    if (shopsMap.has(stock.shop.id)) {
      const existingShop = shopsMap.get(stock.shop.id);
      existingShop.quantity += netAvailableQuantity;
    } else {
      // Get base product price
      const basePrice = stock.batch.product.sellPrice;

      // Filter additional prices for this specific shop
      const shopAdditionalPrices = stock.batch.product.AdditionalPrice.filter(
        (ap) => ap.shopId === null || ap.shopId === stock.shop.id,
      );

      // Calculate total price (base + sum of additional prices)
      let totalPrice = null;
      if (basePrice) {
        const base = parseFloat(basePrice.toString());
        const additionalTotal = shopAdditionalPrices.reduce(
          (sum, ap) => sum + ap.price,
          0,
        );
        totalPrice = base + additionalTotal;
      }

      shopsMap.set(stock.shop.id, {
        shopId: stock.shop.id,
        shopName: stock.shop.name,
        branchName: stock.shop.branch?.name,
        quantity: netAvailableQuantity, // Only net available quantity
        basePrice,
        additionalPrices: shopAdditionalPrices.map((ap) => ({
          id: ap.id,
          label: ap.label,
          price: ap.price,
          isGlobal: ap.shopId === null,
        })),
        totalPrice,
      });
    }
  });

  const shopsArray = Array.from(shopsMap.values());

  // Calculate metadata
  let totalShopsInSystem = 0;
  if (userId) {
    // Count total shops that have this product in stock (regardless of user access)
    const allShopsWithStock = await prisma.shopStock.findMany({
      where: {
        batch: {
          productId,
        },
        status: 'Available',
        quantity: {
          gt: 0,
        },
      },
      select: {
        shopId: true,
      },
      distinct: ['shopId'],
    });
    totalShopsInSystem = allShopsWithStock.length;
  }

  return {
    totalAvailableQuantity,
    shops: shopsArray,
    hasStock: totalAvailableQuantity > 0,
    _metadata: {
      totalShops: userId ? totalShopsInSystem : shopsArray.length,
      accessibleShops: shopsArray.length,
      hasRestrictedAccess: userId
        ? shopsArray.length < totalShopsInSystem
        : false,
      userHasAccess: userId ? userShopIds.length > 0 : null,
      message: userId
        ? `Showing ${shopsArray.length} of ${totalShopsInSystem} shops with available stock`
        : 'Showing all shops with available stock',
    },
  };
};

// Alternative function that explicitly requires userId
const getProductBatchesByShopsForUser = async (productId, userId) => {
  if (!userId) {
    throw new Error('User ID is required for this function');
  }

  return getProductBatchesByShopsUser(productId, userId);
};

const getAvailableProductsWithQuantities = async () => {
  // Get all products with their stock information from all shops and stores
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
    },
    include: {
      batches: {
        include: {
          ShopStock: {
            where: {
              status: 'Available',
            },
            select: {
              quantity: true,
            },
          },
          StoreStock: {
            where: {
              status: 'Available',
            },
            select: {
              quantity: true,
            },
          },
        },
      },
      subProducts: {
        where: {
          isActive: true,
        },
        include: {
          productBatches: {
            include: {
              ShopStock: {
                where: {
                  status: 'Available',
                },
                select: {
                  quantity: true,
                },
              },
              StoreStock: {
                where: {
                  status: 'Available',
                },
                select: {
                  quantity: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Structure the response with only product codes and total quantities
  const result = [];

  // Process main products
  products.forEach((product) => {
    let totalQuantity = 0;

    // Sum up quantities from all batches
    product.batches.forEach((batch) => {
      // Sum shop stocks
      batch.ShopStock.forEach((stock) => {
        totalQuantity += stock.quantity;
      });

      // Sum store stocks
      batch.StoreStock.forEach((stock) => {
        totalQuantity += stock.quantity;
      });
    });

    // Add product to result if it has any stock
    if (totalQuantity > 0) {
      result.push({
        productCode: product.productCode,
        productName: product.name,
        availableQuantity: totalQuantity,
      });
    }

    // Process sub-products for this product
    product.subProducts.forEach((subProduct) => {
      let subTotalQuantity = 0;

      // Sum up quantities from all sub-product batches
      subProduct.productBatches.forEach((batch) => {
        // Sum shop stocks
        batch.ShopStock.forEach((stock) => {
          subTotalQuantity += stock.quantity;
        });

        // Sum store stocks
        batch.StoreStock.forEach((stock) => {
          subTotalQuantity += stock.quantity;
        });
      });

      // Add sub-product to result if it has any stock
      if (subTotalQuantity > 0) {
        result.push({
          productCode: subProduct.subProductCode,
          productName: subProduct.name,
          parentProductCode: product.productCode,
          availableQuantity: subTotalQuantity,
        });
      }
    });
  });

  // Sort by product code
  result.sort((a, b) => a.productCode.localeCompare(b.productCode));

  return {
    items: result,
    totalItems: result.length,
  };
};
const getcodeAvailableProductsWithQuantities = async (productCode) => {
  console.log('=== Starting Availability Check ===');
  console.log(`Query params - productCode: ${productCode}`);

  // Validate that productCode is provided
  if (!productCode) {
    throw new Error('productCode must be provided');
  }

  console.log(`Fetching product: ${productCode}`);

  // Get product with all related data
  const productData = await prisma.product.findUnique({
    where: {
      productCode,
      isActive: true,
    },
    include: {
      batches: {
        include: {
          ShopStock: {
            where: { status: 'Available' },
            select: { quantity: true },
          },
          StoreStock: {
            where: { status: 'Available' },
            select: { quantity: true },
          },
        },
      },
      subProducts: {
        where: { isActive: true },
        include: {
          productBatches: {
            include: {
              ShopStock: {
                where: { status: 'Available' },
                select: { quantity: true },
              },
              StoreStock: {
                where: { status: 'Available' },
                select: { quantity: true },
              },
            },
          },
        },
      },
    },
  });

  if (!productData) {
    throw new Error('Product not found or inactive');
  }

  console.log(`✅ Found product: ${productData.name}`);

  const result = [];

  console.log(`\n--- Processing Main Product ---`);
  console.log(`Main Product: ${productData.productCode} - ${productData.name}`);

  // Calculate main product quantity
  let mainProductQuantity = 0;
  productData.batches?.forEach((batch, index) => {
    console.log(`  Main Product Batch ${index + 1}:`);
    let batchQuantity = 0;

    batch.ShopStock?.forEach((stock) => {
      console.log(`    ShopStock: +${stock.quantity}`);
      mainProductQuantity += stock.quantity;
      batchQuantity += stock.quantity;
    });
    batch.StoreStock?.forEach((stock) => {
      console.log(`    StoreStock: +${stock.quantity}`);
      mainProductQuantity += stock.quantity;
      batchQuantity += stock.quantity;
    });

    console.log(`    Batch total: ${batchQuantity}`);
  });

  console.log(`\n📊 Main Product Total Available: ${mainProductQuantity}`);

  // Add main product to result if it has stock
  if (mainProductQuantity > 0) {
    result.push({
      productCode: productData.productCode,
      productName: productData.name,
      availableQuantity: mainProductQuantity,
    });
  }

  // Process all subproducts for this main product
  console.log(`\n--- Subproducts for ${productData.productCode} ---`);
  console.log(
    `Total subproducts found: ${productData.subProducts?.length || 0}`,
  );

  productData.subProducts?.forEach((subProduct, idx) => {
    console.log(
      `\n  Subproduct ${idx + 1}: ${subProduct.subProductCode} - ${
        subProduct.name
      }`,
    );
    let subTotalQuantity = 0;

    subProduct.productBatches?.forEach((batch, batchIdx) => {
      console.log(`    Batch ${batchIdx + 1}:`);
      let batchQuantity = 0;

      batch.ShopStock?.forEach((stock) => {
        console.log(`      ShopStock: +${stock.quantity}`);
        subTotalQuantity += stock.quantity;
        batchQuantity += stock.quantity;
      });
      batch.StoreStock?.forEach((stock) => {
        console.log(`      StoreStock: +${stock.quantity}`);
        subTotalQuantity += stock.quantity;
        batchQuantity += stock.quantity;
      });

      console.log(`      Batch total: ${batchQuantity}`);
    });

    console.log(`  📊 Subproduct total: ${subTotalQuantity}`);

    // Always include subproduct even if quantity is 0
    result.push({
      subProductCode: subProduct.subProductCode,
      subProductName: subProduct.name,
      productCode: productData.productCode,
      availableQuantity: subTotalQuantity,
    });
  });

  // Sort by product code
  result.sort((a, b) => a.productCode.localeCompare(b.productCode));

  console.log(`\n=== FINAL SUMMARY ===`);
  console.log(`Total items (including zero stock): ${result.length}`);
  console.log(`Details:`);
  result.forEach((item, idx) => {
    console.log(
      `  ${idx + 1}. ${item.productCode} - ${item.productName}: ${
        item.availableQuantity
      } units`,
    );
    if (item.parentProductCode) {
      console.log(`     (Parent: ${item.parentProductCode})`);
    }
  });
  console.log(`=====================\n`);

  return {
    items: result,
    totalItems: result.length,
    mainProduct: {
      code: productData.productCode,
      name: productData.name,
      availableQuantity: mainProductQuantity,
    },
  };
};
// One sub-product: parent product, prices, batches, stock per location and
// recent movements. Stock, prices and movements are limited to the user's
// stores and shops, like getProductDetails.
const getSubProductDetails = async (subProductId, userId) => {
  const access = await getAccessibleLocations(userId);
  if (!access) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  const { shopIds, storeIds } = access;

  const subProduct = await prisma.subProduct.findUnique({
    where: { id: subProductId },
    include: {
      product: {
        include: { category: true, subCategory: true, unitOfMeasure: true },
      },
      additionalPrices: {
        where: { OR: [{ shopId: null }, { shopId: { in: shopIds } }] },
        include: { shop: { include: { branch: true } } },
      },
      productBatches: {
        orderBy: { expiryDate: 'asc' },
        include: {
          StoreStock: {
            where: { storeId: { in: storeIds }, status: 'Available' },
            include: { store: { include: { branch: true } } },
          },
          ShopStock: {
            where: { shopId: { in: shopIds }, status: 'Available' },
            include: { shop: { include: { branch: true } } },
          },
        },
      },
    },
  });
  if (!subProduct) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sub-product not found');
  }

  const now = new Date();
  const batches = subProduct.productBatches.map((batch) => {
    const storeQuantity = batch.StoreStock.reduce((t, s) => t + s.quantity, 0);
    const shopQuantity = batch.ShopStock.reduce((t, s) => t + s.quantity, 0);
    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      isExpired: !!batch.expiryDate && batch.expiryDate <= now,
      price: batch.price,
      storeQuantity,
      shopQuantity,
      totalQuantity: storeQuantity + shopQuantity,
    };
  });

  // Stock per location, summed over this sub-product's batches
  const locations = new Map();
  subProduct.productBatches.forEach((batch) => {
    batch.StoreStock.forEach((stock) => {
      const key = `store:${stock.storeId}`;
      const entry = locations.get(key) || {
        type: 'store',
        id: stock.storeId,
        name: stock.store?.name,
        branchName: stock.store?.branch?.name,
        quantity: 0,
      };
      entry.quantity += stock.quantity;
      locations.set(key, entry);
    });
    batch.ShopStock.forEach((stock) => {
      const key = `shop:${stock.shopId}`;
      const entry = locations.get(key) || {
        type: 'shop',
        id: stock.shopId,
        name: stock.shop?.name,
        branchName: stock.shop?.branch?.name,
        quantity: 0,
      };
      entry.quantity += stock.quantity;
      locations.set(key, entry);
    });
  });
  const locationStocks = Array.from(locations.values()).sort((a, b) =>
    a.type === b.type
      ? String(a.name).localeCompare(String(b.name))
      : a.type.localeCompare(b.type),
  );

  // Full stock ledger of this sub-product's batches (same shape as the
  // product details ledger), in the user's stores and shops
  const batchIds = batches.map((batch) => batch.id);
  const branchSelect = { select: { id: true, name: true } };
  const ledgers =
    batchIds.length === 0
      ? []
      : await prisma.stockLedger.findMany({
          where: {
            batchId: { in: batchIds },
            OR: [{ storeId: { in: storeIds } }, { shopId: { in: shopIds } }],
          },
          orderBy: { movementDate: 'desc' },
          include: {
            batch: { select: { id: true, batchNumber: true } },
            unitOfMeasure: true,
            store: {
              select: { id: true, name: true, branch: branchSelect },
            },
            shop: {
              select: { id: true, name: true, branch: branchSelect },
            },
            user: { select: { id: true, name: true, email: true } },
          },
        });
  const ledgerSaleInfo = await loadLedgerSaleInfo(ledgers);

  const storeQuantity = batches.reduce((t, b) => t + b.storeQuantity, 0);
  const shopQuantity = batches.reduce((t, b) => t + b.shopQuantity, 0);
  const { product } = subProduct;
  return {
    subProduct: {
      id: subProduct.id,
      name: subProduct.name,
      subProductCode: subProduct.subProductCode,
      imageUrl: subProduct.imageUrl,
      isActive: subProduct.isActive,
      sellPrice: subProduct.sellPrice,
      ecommercePrice: subProduct.ecommercePrice,
      // the price sales use: the sub-product's own, else the product's
      effectiveSellPrice: subProduct.sellPrice ?? product.sellPrice,
      createdAt: subProduct.createdAt,
      updatedAt: subProduct.updatedAt,
    },
    product: {
      id: product.id,
      name: product.name,
      productCode: product.productCode,
      sellPrice: product.sellPrice,
      ecommercePrice: product.ecommercePrice,
      warningQuantity: product.warningQuantity,
      category: product.category
        ? { id: product.category.id, name: product.category.name }
        : null,
      subCategory: product.subCategory
        ? { id: product.subCategory.id, name: product.subCategory.name }
        : null,
      unitOfMeasure: product.unitOfMeasure,
    },
    additionalPrices: subProduct.additionalPrices.map((price) => ({
      id: price.id,
      label: price.label,
      price: price.price,
      shopId: price.shopId,
      shopName: price.shop?.name,
      branchName: price.shop?.branch?.name,
    })),
    batches,
    locationStocks,
    stockLedgers: ledgers.map((ledger) => ({
      id: ledger.id,
      invoiceNo: ledger.invoiceNo,
      // Set on sale / sale-correction rows: customer, salesperson, unit price
      sale: ledgerSaleInfo.get(ledger.id)?.sale ?? null,
      unitPrice: ledgerSaleInfo.get(ledger.id)?.unitPrice ?? null,
      movementType: ledger.movementType,
      quantity: ledger.quantity,
      unitOfMeasure: ledger.unitOfMeasure,
      reference: ledger.reference,
      userId: ledger.userId,
      user: ledger.user,
      store: ledger.store,
      shop: ledger.shop,
      batch: ledger.batch,
      notes: ledger.notes,
      movementDate: ledger.movementDate,
      createdAt: ledger.createdAt,
      updatedAt: ledger.updatedAt,
    })),
    summary: {
      storeQuantity,
      shopQuantity,
      totalQuantity: storeQuantity + shopQuantity,
      batchCount: batches.length,
      locationCount: locationStocks.length,
    },
  };
};

// Price Update page: set many sell prices / additional prices at once.
// Each change carries the price the page showed (oldPrice); the row is only
// updated if it still has that price, so two people editing at once can't
// silently overwrite each other.
const PRICE_CHANGE_LIMIT = 5000;
const PRICE_KINDS = [
  'product',
  'subProduct',
  'additional',
  'ecommerceProduct',
  'ecommerceSubProduct',
];

const updatePrices = async (changes, userId) => {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No price changes to save');
  }
  if (changes.length > PRICE_CHANGE_LIMIT) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `At most ${PRICE_CHANGE_LIMIT} prices can be changed at once`,
    );
  }

  const seen = new Set();
  const parsed = changes.map((change, index) => {
    const { kind, id } = change || {};
    if (!PRICE_KINDS.includes(kind) || !id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Change ${index + 1}: kind must be one of ${PRICE_KINDS.join(
          ', ',
        )}, with an id`,
      );
    }
    const key = `${kind}|${id}`;
    if (seen.has(key)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Change ${index + 1}: the same price is listed twice`,
      );
    }
    seen.add(key);

    const newPrice = Number(change.newPrice);
    if (
      change.newPrice === null ||
      change.newPrice === '' ||
      !Number.isFinite(newPrice) ||
      newPrice < 0
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Change ${index + 1}: the new price must be a number of 0 or more`,
      );
    }
    const hasOld = change.oldPrice !== null && change.oldPrice !== undefined;
    const oldPrice = hasOld ? Number(change.oldPrice) : null;
    if (hasOld && !Number.isFinite(oldPrice)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Change ${index + 1}: invalid old price`,
      );
    }
    return {
      kind,
      id: String(id),
      newPrice: Math.round(newPrice * 100) / 100,
      // exact string: a JS number would be compared to DECIMAL as a float
      oldPrice: hasOld ? oldPrice.toFixed(2) : null,
    };
  });

  const counts = {
    product: 0,
    subProduct: 0,
    additional: 0,
    ecommerceProduct: 0,
    ecommerceSubProduct: 0,
  };

  await runStockTransaction(async (tx) => {
    // One at a time: each update is a compare-and-set that must stop the
    // whole save on the first conflict
    // eslint-disable-next-line no-restricted-syntax
    for (const change of parsed) {
      let result;
      if (change.kind === 'additional') {
        // eslint-disable-next-line no-await-in-loop
        result = await tx.additionalPrice.updateMany({
          where: { id: change.id, price: change.oldPrice ?? undefined },
          data: { price: change.newPrice },
        });
      } else if (
        change.kind === 'ecommerceProduct' ||
        change.kind === 'ecommerceSubProduct'
      ) {
        // The price shown online (sent to e-commerce by "Sync prices")
        const model =
          change.kind === 'ecommerceProduct' ? tx.product : tx.subProduct;
        // eslint-disable-next-line no-await-in-loop
        result = await model.updateMany({
          where: { id: change.id, ecommercePrice: change.oldPrice },
          data: { ecommercePrice: change.newPrice },
        });
      } else {
        const model = change.kind === 'product' ? tx.product : tx.subProduct;
        // eslint-disable-next-line no-await-in-loop
        result = await model.updateMany({
          where: { id: change.id, sellPrice: change.oldPrice },
          data: { sellPrice: change.newPrice },
        });
      }
      if (result.count !== 1) {
        throw new ApiError(
          httpStatus.CONFLICT,
          'Some prices were changed by someone else or no longer exist. Reload the page and try again.',
        );
      }
      counts[change.kind] += 1;
    }

    await tx.log.create({
      data: {
        action: `Updated prices: ${counts.product} product sell price(s), ${
          counts.subProduct
        } sub-product sell price(s), ${
          counts.additional
        } additional price(s), ${
          counts.ecommerceProduct + counts.ecommerceSubProduct
        } e-commerce price(s)`,
        userId,
      },
    });
  });

  return { updated: parsed.length, ...counts };
};

module.exports = {
  updatePrices,
  getSubProductDetails,
  createProductBatch,
  getSubProductsByProductId,
  getProductById,
  getProductByCode,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getBatchesByProduct,
  getActiveAllProducts,
  createProductBatchsingle,
  getProductDetails,
  getProductBatchesByShops,
  getTopSellingProducts,
  getRandomProductsWithShopStocks,
  getProductBatchesByShopsForUser,
  getAllSubProducts,
  getAvailableProductsWithQuantities,
  getcodeAvailableProductsWithQuantities,
};
