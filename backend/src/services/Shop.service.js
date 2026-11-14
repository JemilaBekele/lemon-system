const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');
const { getAccessibleLocations } = require('../utils/accessibleLocations');

// Get Shop by ID
const getShopById = async (id) => {
  const shop = await prisma.shop.findUnique({
    where: { id },
    include: {
      branch: true,
    },
  });
  return shop;
};

// Get Shop by Name
const getShopByName = async (name) => {
  const shop = await prisma.shop.findFirst({
    where: { name },
  });
  return shop;
};

const getAllshop = async () => {
  const shops = await prisma.shop.findMany();
console.log("shop",shops)
  return {
    shops,
    count: shops.length,
  };
};
// Get all Shops

const getAllShops = async (userId) => {
  // Get the shops the user can access (admins: all shops)
  const locations = await getAccessibleLocations(userId);

  if (!locations) {
    throw new Error('User not found');
  }

  // If user is admin, return all shops
  if (locations.isAdmin) {
    const shops = await prisma.shop.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        branch: true,
      },
    });

    return {
      shops,
      count: shops.length,
    };
  }

  // Regular user: filter by accessible shops
  const accessibleShopIds = locations.shopIds;

  // If user has no shops, return empty array
  if (accessibleShopIds.length === 0) {
    return {
      shops: [],
      count: 0,
    };
  }

  const shops = await prisma.shop.findMany({
    where: {
      id: { in: accessibleShopIds }, // Filter by accessible shops
    },
    orderBy: {
      name: 'asc',
    },
    include: {
      branch: true,
    },
  });

  return {
    shops,
    count: shops.length,
  };
};
const getAllShopsbaseduser = async (userId = null) => {
  // If no userId provided, return all shops (for admin/superuser scenarios)
  if (!userId) {
    const shops = await prisma.shop.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        branch: true,
      },
    });

    return {
      shops,
      count: shops.length,
    };
  }

  // For specific user, return only their allowed shops (admins: all shops)
  const locations = await getAccessibleLocations(userId);

  if (!locations) {
    throw new Error('User not found');
  }

  const shops = await prisma.shop.findMany({
    where: { id: { in: locations.shopIds } },
  });

  return {
    shops,
    count: shops.length,
  };
};

// Create Shop
const createShop = async (shopBody) => {
  // Check if shop with same name already exists
  if (await getShopByName(shopBody.name)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shop name already taken');
  }

  // Validate branch exists
  const branchExists = await prisma.branch.findUnique({
    where: { id: shopBody.branchId },
  });
  if (!branchExists) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch not found');
  }

  const shop = await prisma.shop.create({
    data: shopBody,
    include: {
      branch: true,
    },
  });
  return shop;
};

// Update Shop
const updateShop = async (id, updateBody) => {
  const existingShop = await getShopById(id);
  if (!existingShop) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shop not found');
  }

  // Check if name is being updated to an existing shop name
  if (updateBody.name && updateBody.name !== existingShop.name) {
    if (await getShopByName(updateBody.name)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Shop name already taken');
    }
  }

  // Validate branch exists if being updated
  if (updateBody.branchId) {
    const branchExists = await prisma.branch.findUnique({
      where: { id: updateBody.branchId },
    });
    if (!branchExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Branch not found');
    }
  }

  const updatedShop = await prisma.shop.update({
    where: { id },
    data: updateBody,
    include: {
      branch: true,
    },
  });

  return updatedShop;
};

// Delete Shop getAllShopsbaseduser
const deleteShop = async (id) => {
  const existingShop = await getShopById(id);
  if (!existingShop) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shop not found');
  }

  // Shop-specific additional prices would otherwise be set to shopId null,
  // which turns them into prices for every shop. Remove them together with
  // the shop; if the shop is still referenced (stock, sales, transfers…)
  // the delete fails and the prices are kept.
  await prisma.$transaction([
    prisma.additionalPrice.deleteMany({ where: { shopId: id } }),
    prisma.shop.delete({ where: { id } }),
  ]);

  return { message: 'Shop deleted successfully' };
};
const UsergetAvailableBatchesByProductAndShop = async (productId, userId) => {
  // First, get the user with their allowed shops

  const locations = await getAccessibleLocations(userId);

  if (!locations) {
    throw new Error('User not found');
  }

  // Extract shop IDs from user's allowed shops (admins: all shops)
  const userShopIds = locations.shopIds;

  if (userShopIds.length === 0) {
    return {
      batches: [],
      count: 0,
    };
  }

  // Check if the requested product exists
  const productExists = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!productExists) {
    return {
      batches: [],
      count: 0,
    };
  }

  // Get batches available in any of the user's allowed shops
  const batches = await prisma.productBatch.findMany({
    where: {
      productId,
      ShopStock: {
        some: {
          shopId: {
            in: userShopIds,
          },
          status: 'Available',
          quantity: {
            gt: 0,
          },
        },
      },
    },
    orderBy: [{ expiryDate: 'asc' }, { batchNumber: 'asc' }],
    include: {
      product: {
        include: {
          unitOfMeasure: true,
          category: true,
          subCategory: true,
        },
      },
      store: true,
      AdditionalPrice: {
        where: {
          OR: [{ shopId: { in: userShopIds } }, { shopId: null }],
        },
      },
      ShopStock: {
        where: {
          shopId: {
            in: userShopIds,
          },
          status: 'Available',
          quantity: {
            gt: 0,
          },
        },
        include: {
          unitOfMeasure: true,
        },
      },
    },
  });

  return {
    batches,
    count: batches.length,
  };
};
const getAvailableBatchesByProductAndShop = async (
  productId,
  shopId,
  subCategoryId = null,
  subProductId = null,
) => {
  try {
    // Check if the requested product exists
    const productExists = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!productExists) {
      return {
        batches: [],
        additionalPrices: [],
        count: 0,
      };
    }

    // Check if shop exists
    const shopExists = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true },
    });

    if (!shopExists) {
      return {
        batches: [],
        additionalPrices: [],
        count: 0,
      };
    }

    // Get additional prices for this product and shop
    const additionalPrices = await prisma.additionalPrice.findMany({
      where: {
        productId,
        AND: [
          // Shop-specific and global additional prices
          { OR: [{ shopId }, { shopId: null }] },
          // product-level prices, plus the sub-product's own when one is given
          {
            OR: subProductId
              ? [{ subProductId: null }, { subProductId }]
              : [{ subProductId: null }],
          },
        ],
      },
      orderBy: {
        price: 'asc',
      },
    });

    // Build the where clause for batches
    const batchWhereClause = {
      productId,
      ShopStock: {
        some: {
          shopId,
          status: 'Available',
          quantity: {
            gt: 0,
          },
        },
      },
    };

    // A sub-product line can only be filled from that sub-product's batches
    if (subProductId) {
      batchWhereClause.subProductId = subProductId;
    }

    // Add subcategory filter if subCategoryId is provided
    if (subCategoryId) {
      batchWhereClause.product = {
        subCategoryId: subCategoryId
      };
    }

    // Main query for batches
    const batches = await prisma.productBatch.findMany({
      where: batchWhereClause,
      orderBy: [{ expiryDate: 'asc' }, { batchNumber: 'asc' }],
      include: {
        product: {
          include: {
            unitOfMeasure: true,
            category: true,
            subCategory: true,
          },
        },
        store: true,
        ShopStock: {
          where: {
            shopId,
            status: 'Available',
          },
          include: {
            unitOfMeasure: true,
          },
        },
      },
    });

    return {
      // availableQuantity: what this shop holds of the batch right now
      batches: batches.map((batch) => ({
        ...batch,
        availableQuantity: batch.ShopStock.reduce(
          (sum, stock) => sum + stock.quantity,
          0,
        ),
      })),
      additionalPrices,
      count: batches.length,
    };
  } catch (error) {
    console.error('💥 Error in getAvailableBatchesByProductAndShop:', error);
    throw error;
  }
};
module.exports = {
  getShopById,
  getAllshop,
  getShopByName,
  getAllShops,
  createShop,
  updateShop,
  deleteShop,
  getAvailableBatchesByProductAndShop,
  getAllShopsbaseduser,
  UsergetAvailableBatchesByProductAndShop,
};
