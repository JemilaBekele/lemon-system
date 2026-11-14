const prisma = require('../services/prisma');

/**
 * A user is an admin when the `admin` flag is set on the user (set for the
 * seeded system admin in middlewares/initialSetup.js) or their role is named
 * "Admin" (case-insensitive).
 */
const isAdminUser = (user) => {
  if (!user) return false;
  if (user.admin === true) return true;
  const roleName = (user.role?.name || '').trim().toLowerCase();
  return roleName === 'admin';
};

/**
 * Resolve the shops and stores a user may see.
 * Admins see every shop and store; everyone else sees only the shops/stores
 * assigned to them.
 *
 * @param {string} userId
 * @param {object} [client] - prisma client or transaction client
 * @returns {Promise<{ isAdmin: boolean, shopIds: string[], storeIds: string[] } | null>}
 *   null when the user does not exist.
 */
const getAccessibleLocations = async (userId, client = prisma) => {
  if (!userId) return null;

  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      admin: true,
      role: { select: { name: true } },
      shops: { select: { id: true } },
      stores: { select: { id: true } },
    },
  });

  if (!user) return null;

  if (isAdminUser(user)) {
    const [shops, stores] = await Promise.all([
      client.shop.findMany({ select: { id: true } }),
      client.store.findMany({ select: { id: true } }),
    ]);
    return {
      isAdmin: true,
      shopIds: shops.map((shop) => shop.id),
      storeIds: stores.map((store) => store.id),
    };
  }

  return {
    isAdmin: false,
    shopIds: user.shops.map((shop) => shop.id),
    storeIds: user.stores.map((store) => store.id),
  };
};

/**
 * Active users who should get real-time alerts for the given shops: everyone
 * assigned to one of them, plus every admin (who sees all shops). Each user's
 * `shops` lists the matching shops, and for admins that is all of them.
 *
 * @param {string[]} shopIds
 * @param {object} [client] - prisma client or transaction client
 * @returns {Promise<Array<{ id: string, name: string, email: string, shops: Array<{ id: string, name: string }> }>>}
 */
const getShopNotificationRecipients = async (shopIds, client = prisma) => {
  if (!shopIds || shopIds.length === 0) return [];

  const users = await client.user.findMany({
    where: {
      status: 'Active',
      OR: [
        { shops: { some: { id: { in: shopIds } } } },
        { admin: true },
        // MySQL's default collation compares case-insensitively
        { role: { name: 'Admin' } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      admin: true,
      role: { select: { name: true } },
      shops: {
        where: { id: { in: shopIds } },
        select: { id: true, name: true },
      },
    },
  });

  const allShops = users.some(isAdminUser)
    ? await client.shop.findMany({
        where: { id: { in: shopIds } },
        select: { id: true, name: true },
      })
    : [];

  return users.map(({ admin, role, ...user }) =>
    isAdminUser({ admin, role }) ? { ...user, shops: allShops } : user,
  );
};

module.exports = {
  getAccessibleLocations,
  getShopNotificationRecipients,
  isAdminUser,
};
