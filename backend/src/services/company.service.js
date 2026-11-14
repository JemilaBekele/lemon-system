/* eslint-disable no-nested-ternary */
/* eslint-disable no-restricted-syntax */
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');
const { uploadImage } = require('../utils/upload.util');
const { getAccessibleLocations } = require('../utils/accessibleLocations');

// Get Company by Email
const getCompanyByEmail = async (email) => {
  const company = await prisma.company.findUnique({
    where: { email },
  });
  return company;
};
// Create Company
const createCompany = async (companyData, files) => {
  const { name, email, phone, address, description, tinAddress, TIN, From } =
    companyData;

  let logoPath = null;

  // Process the logo if provided
  const logoFile = Array.isArray(files?.logo) ? files.logo[0] : files?.logo;

  if (logoFile) {
    try {
      logoPath = await uploadImage(logoFile, 'company_logos');
    } catch (err) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Logo processing failed',
      );
    }
  }

  const company = await prisma.company.create({
    data: {
      name,
      email,
      phone,
      address,
      description,
      tinAddress,
      TIN,
      From,
      logo: logoPath,
    },
  });

  return company;
};

// Get Company by ID
const getCompanyById = async (id) => {
  const company = await prisma.company.findUnique({
    where: { id },
  });
  return company;
};

// Get all Companies
const getAllCompanies = async () => {
  const companies = await prisma.company.findMany({
    orderBy: {
      name: 'asc',
    },
  });

  return {
    companies,
    count: companies.length,
  };
};

const updateCompany = async (id, updateBody, files) => {
  const existingCompany = await getCompanyById(id);
  if (!existingCompany) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');
  }

  // Clean the updateBody to remove any weird field names
  const cleanedUpdateBody = {};
  for (const [key, value] of Object.entries(updateBody)) {
    // Remove any non-alphanumeric characters from field names
    const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '');
    cleanedUpdateBody[cleanKey] = value;
  }

  // Email uniqueness check
  if (
    cleanedUpdateBody.email &&
    cleanedUpdateBody.email !== existingCompany.email
  ) {
    if (await getCompanyByEmail(cleanedUpdateBody.email)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
    }
  }

  let logoPath = existingCompany.logo; // Keep existing logo by default

  // Process new logo if provided
  const logoFile = files?.logo
    ? Array.isArray(files.logo)
      ? files.logo[0]
      : files.logo
    : null;

  if (logoFile) {
    try {
      logoPath = await uploadImage(logoFile, 'company_logos');
    } catch (err) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Logo processing failed',
      );
    }
  }

  const updatedCompany = await prisma.company.update({
    where: { id },
    data: {
      ...cleanedUpdateBody, // Use the cleaned body
      logo: logoPath,
    },
  });

  return updatedCompany;
};

// Delete Company
const deleteCompany = async (id) => {
  const existingCompany = await getCompanyById(id);
  if (!existingCompany) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');
  }

  await prisma.company.delete({
    where: { id },
  });

  return { message: 'Company deleted successfully' };
};
const getNotifications = async (userId, options = {}) => {
  const { unreadOnly = false, type, shopId, storeId } = options;

  // First, get the shops and stores the user can see (admins: all of them)
  const locations = await getAccessibleLocations(userId);

  if (!locations) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const userShopIds = locations.shopIds;
  const userStoreIds = locations.storeIds;
  const [userShops, userStores] = await Promise.all([
    prisma.shop.findMany({
      where: { id: { in: userShopIds } },
      select: { id: true, name: true },
    }),
    prisma.store.findMany({
      where: { id: { in: userStoreIds } },
      select: { id: true, name: true },
    }),
  ]);

  // Build where clause for notifications
  const where = {
    OR: [
      // Notifications assigned to user's shops
      {
        shopId: {
          in: userShopIds.length > 0 ? userShopIds : [],
        },
      },
      // Notifications assigned to user's stores
      {
        storeId: {
          in: userStoreIds.length > 0 ? userStoreIds : [],
        },
      },
      // Notifications without specific shop/store assignment (global notifications)
      {
        AND: [{ shopId: null }, { storeId: null }],
      },
    ],
  };

  // Add read filter if unreadOnly is true
  if (unreadOnly) {
    where.read = false;
  }

  // Add type filter if provided
  if (type) {
    where.type = type;
  }

  // Add shop filter if provided (and user has access to that shop)
  if (shopId) {
    if (!userShopIds.includes(shopId)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'User does not have access to this shop',
      );
    }
    where.shopId = shopId;
  }

  // Add store filter if provided (and user has access to that store)
  if (storeId) {
    if (!userStoreIds.includes(storeId)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'User does not have access to this store',
      );
    }
    where.storeId = storeId;
  }

  const notifications = await prisma.notification.findMany({
    where,
    include: {
      shop: {
        select: {
          id: true,
          name: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    notifications,
    count: notifications.length,
    userAccess: {
      shops: userShops,
      stores: userStores,
    },
  };
};

const markAsRead = async (notificationId, userId) => {
  // First verify user has access to this notification
  const locations = await getAccessibleLocations(userId);

  if (!locations) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const userShopIds = locations.shopIds;
  const userStoreIds = locations.storeIds;

  // Verify the notification exists and user has access to it
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      OR: [
        { shopId: { in: userShopIds } },
        { storeId: { in: userStoreIds } },
        {
          AND: [{ shopId: null }, { storeId: null }],
        },
      ],
    },
  });

  if (!notification) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Notification not found or access denied',
    );
  }

  // Mark as read
  const updatedNotification = await prisma.notification.update({
    where: { id: notificationId },
    data: {
      read: true,
      readAt: new Date(),
    },
    include: {
      shop: {
        select: {
          id: true,
          name: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return updatedNotification;
};
module.exports = {
  createCompany,
  getCompanyById,
  getCompanyByEmail,
  getAllCompanies,
  updateCompany,
  deleteCompany,
  getNotifications,
  markAsRead,
};
