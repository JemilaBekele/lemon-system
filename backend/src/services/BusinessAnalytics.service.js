/* eslint-disable no-underscore-dangle */
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

// Main dashboard: sales and stock for a date range (and optional branch).
// The business keeps its finances (costs, profit, supplier payments) in
// other software, so this only reports sales at the prices charged and the
// state of the stock.
//
// - A sale counts once it is approved: APPROVED, PARTIALLY_DELIVERED or
//   DELIVERED. NOT_APPROVED, CANCELLED and RETURNED are left out.
// - Sales amount = the sale's NetTotal (after discount and approved
//   returns). Breakdowns by product, shop and category use line totals.

const COUNTED_SALE_STATUSES = ['APPROVED', 'PARTIALLY_DELIVERED', 'DELIVERED'];
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WINDOW_DAYS = 60;
const LIST_SIZE = 8;
const ALERT_LIST_SIZE = 15;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (value) => Math.round(value * 100) / 100;

const parseDay = (value, name) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, `${name} must be a date`);
  }
  return date;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

// Empty trend buckets for the whole range, so days without sales show as 0
const buildBuckets = (from, to, granularity) => {
  const buckets = new Map();
  const cursor = new Date(from);
  if (granularity === 'month') cursor.setDate(1);
  while (cursor <= to) {
    const key = granularity === 'month' ? monthKey(cursor) : dayKey(cursor);
    buckets.set(key, { period: key, amount: 0, sales: 0, items: 0 });
    if (granularity === 'month') cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
};

const saleWhere = (from, to, branchId) => ({
  saleStatus: { in: COUNTED_SALE_STATUSES },
  saleDate: { gte: from, lte: to },
  ...(branchId ? { branchId } : {}),
});

const pctChange = (current, previous) =>
  previous > 0 ? round2(((current - previous) / previous) * 100) : null;

const stockSelect = {
  quantity: true,
  batch: {
    select: {
      id: true,
      batchNumber: true,
      expiryDate: true,
      productId: true,
      product: { select: { name: true, productCode: true } },
      subProduct: { select: { name: true } },
    },
  },
};

const getBusinessAnalytics = async ({
  from: fromInput,
  to: toInput,
  branchId,
} = {}) => {
  const from = startOfDay(parseDay(fromInput, 'from'));
  const to = startOfDay(parseDay(toInput, 'to'));
  to.setHours(23, 59, 59, 999);
  if (from > to) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'from must be before to');
  }

  const rangeDays = Math.round((to - from) / DAY_MS);
  const granularity = rangeDays > 62 ? 'month' : 'day';
  // Same length, immediately before
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(
    from.getTime() - (to.getTime() - from.getTime() + 1),
  );

  const now = new Date();
  const expiryLimit = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * DAY_MS);

  const [
    sales,
    items,
    previousTotals,
    previousItems,
    storeStocks,
    shopStocks,
    products,
    pendingSales,
    pendingPurchases,
    pendingTransfers,
    pendingStockCorrections,
    pendingSaleCorrections,
  ] = await Promise.all([
    prisma.sell.findMany({
      where: saleWhere(from, to, branchId),
      select: {
        id: true,
        saleDate: true,
        NetTotal: true,
        customer: { select: { id: true, name: true, companyName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.sellItem.findMany({
      where: { sell: saleWhere(from, to, branchId) },
      select: {
        productId: true,
        subProductId: true,
        shopId: true,
        quantity: true,
        totalPrice: true,
        sell: { select: { saleDate: true } },
        product: {
          select: {
            name: true,
            productCode: true,
            category: { select: { id: true, name: true } },
          },
        },
        subProduct: { select: { name: true } },
        shop: { select: { id: true, name: true } },
      },
    }),
    prisma.sell.aggregate({
      where: saleWhere(previousFrom, previousTo, branchId),
      _sum: { NetTotal: true },
      _count: { id: true },
    }),
    prisma.sellItem.aggregate({
      where: { sell: saleWhere(previousFrom, previousTo, branchId) },
      _sum: { quantity: true },
    }),
    prisma.storeStock.findMany({
      where: {
        quantity: { gt: 0 },
        ...(branchId ? { store: { branchId } } : {}),
      },
      select: stockSelect,
    }),
    prisma.shopStock.findMany({
      where: {
        quantity: { gt: 0 },
        ...(branchId ? { shop: { branchId } } : {}),
      },
      select: stockSelect,
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        productCode: true,
        warningQuantity: true,
      },
    }),
    prisma.sell.count({
      where: { saleStatus: 'NOT_APPROVED', ...(branchId ? { branchId } : {}) },
    }),
    prisma.purchase.count({
      where: {
        status: 'PENDING',
        ...(branchId ? { store: { branchId } } : {}),
      },
    }),
    prisma.transfer.count({ where: { status: 'PENDING' } }),
    prisma.stockCorrection.count({ where: { status: 'PENDING' } }),
    prisma.sellStockCorrection.count({
      where: { status: { in: ['PENDING', 'PARTIAL'] } },
    }),
  ]);

  // ---- Sales lines: items sold and breakdowns ----
  const buckets = buildBuckets(from, to, granularity);
  const bucketOf = (date) =>
    buckets.get(granularity === 'month' ? monthKey(date) : dayKey(date));

  const byProduct = new Map();
  const byShop = new Map();
  const byCategory = new Map();
  let itemsSold = 0;

  items.forEach((item) => {
    const amount = num(item.totalPrice);
    itemsSold += item.quantity;

    const bucket = bucketOf(new Date(item.sell.saleDate));
    if (bucket) bucket.items += item.quantity;

    const productKey = `${item.productId}|${item.subProductId || ''}`;
    const product = byProduct.get(productKey) || {
      name: item.subProduct
        ? `${item.product.name} · ${item.subProduct.name}`
        : item.product.name,
      code: item.product.productCode,
      quantity: 0,
      amount: 0,
    };
    product.quantity += item.quantity;
    product.amount += amount;
    byProduct.set(productKey, product);

    const shopKey = item.shopId || 'none';
    const shop = byShop.get(shopKey) || {
      name: item.shop ? item.shop.name : 'No shop',
      amount: 0,
      quantity: 0,
    };
    shop.amount += amount;
    shop.quantity += item.quantity;
    byShop.set(shopKey, shop);

    const { category } = item.product;
    const categoryKey = category ? category.id : 'none';
    const categoryRow = byCategory.get(categoryKey) || {
      name: category ? category.name : 'Uncategorised',
      amount: 0,
      quantity: 0,
    };
    categoryRow.amount += amount;
    categoryRow.quantity += item.quantity;
    byCategory.set(categoryKey, categoryRow);
  });

  // ---- Sales headers: amount, customers, salespeople, trend ----
  const byCustomer = new Map();
  const bySalesperson = new Map();
  let salesAmount = 0;
  sales.forEach((sale) => {
    const amount = num(sale.NetTotal);
    salesAmount += amount;

    const bucket = bucketOf(new Date(sale.saleDate));
    if (bucket) {
      bucket.amount += amount;
      bucket.sales += 1;
    }

    if (sale.customer) {
      const customer = byCustomer.get(sale.customer.id) || {
        name: sale.customer.companyName || sale.customer.name,
        orders: 0,
        amount: 0,
      };
      customer.orders += 1;
      customer.amount += amount;
      byCustomer.set(sale.customer.id, customer);
    }

    const sellerKey = sale.createdBy ? sale.createdBy.id : 'none';
    const seller = bySalesperson.get(sellerKey) || {
      name: sale.createdBy ? sale.createdBy.name : 'Unknown',
      orders: 0,
      amount: 0,
    };
    seller.orders += 1;
    seller.amount += amount;
    bySalesperson.set(sellerKey, seller);
  });

  const trend = [...buckets.values()].map((bucket) => ({
    ...bucket,
    amount: round2(bucket.amount),
  }));

  // ---- Stock: totals, low / out of stock, expiring, not selling ----
  const stockByProduct = new Map();
  const expiring = new Map();
  let unitsInStock = 0;
  [...storeStocks, ...shopStocks].forEach((row) => {
    const { batch } = row;
    if (!batch) return;
    unitsInStock += row.quantity;
    stockByProduct.set(
      batch.productId,
      (stockByProduct.get(batch.productId) || 0) + row.quantity,
    );

    if (batch.expiryDate && new Date(batch.expiryDate) <= expiryLimit) {
      const entry = expiring.get(batch.id) || {
        product: batch.subProduct
          ? `${batch.product.name} · ${batch.subProduct.name}`
          : batch.product.name,
        code: batch.product.productCode,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        daysLeft: Math.ceil((new Date(batch.expiryDate) - now) / DAY_MS),
        quantity: 0,
      };
      entry.quantity += row.quantity;
      expiring.set(batch.id, entry);
    }
  });

  const soldProductIds = new Set(items.map((item) => item.productId));
  const lowStock = [];
  const notSelling = [];
  let outOfStockCount = 0;
  products.forEach((product) => {
    const quantity = stockByProduct.get(product.id) || 0;
    if (quantity === 0) outOfStockCount += 1;
    if (product.warningQuantity > 0 && quantity <= product.warningQuantity) {
      lowStock.push({
        name: product.name,
        code: product.productCode,
        quantity,
        warningQuantity: product.warningQuantity,
      });
    }
    if (quantity > 0 && !soldProductIds.has(product.id)) {
      notSelling.push({
        name: product.name,
        code: product.productCode,
        quantity,
      });
    }
  });

  const expiringRows = [...expiring.values()].sort(
    (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate),
  );

  const top = (map, field, size = LIST_SIZE) =>
    [...map.values()]
      .sort((a, b) => b[field] - a[field])
      .slice(0, size)
      .map((row) => ({ ...row, amount: round2(row.amount || 0) }));

  const salesCount = sales.length;
  const previousAmount = num(previousTotals._sum.NetTotal);
  const previousCount = previousTotals._count.id;
  const previousItemsSold = num(previousItems._sum.quantity);

  return {
    range: {
      from: dayKey(from),
      to: dayKey(to),
      previousFrom: dayKey(previousFrom),
      previousTo: dayKey(previousTo),
      granularity,
    },
    kpis: {
      salesAmount: round2(salesAmount),
      salesCount,
      averageSale: salesCount > 0 ? round2(salesAmount / salesCount) : 0,
      itemsSold,
      productsInStock: stockByProduct.size,
      unitsInStock,
      outOfStockCount,
      lowStockCount: lowStock.length,
      expiringCount: expiringRows.filter((row) => row.daysLeft >= 0).length,
      expiredCount: expiringRows.filter((row) => row.daysLeft < 0).length,
    },
    previous: {
      salesAmount: round2(previousAmount),
      salesCount: previousCount,
      itemsSold: previousItemsSold,
      salesAmountChange: pctChange(salesAmount, previousAmount),
      salesCountChange: pctChange(salesCount, previousCount),
      itemsSoldChange: pctChange(itemsSold, previousItemsSold),
    },
    trend,
    topProducts: top(byProduct, 'quantity'),
    topCustomers: top(byCustomer, 'amount'),
    salespeople: top(bySalesperson, 'amount'),
    byShop: top(byShop, 'amount', 20),
    byCategory: top(byCategory, 'amount', 20),
    // Lowest stock relative to its warning level first
    lowStock: lowStock
      .sort(
        (a, b) =>
          a.quantity / a.warningQuantity - b.quantity / b.warningQuantity,
      )
      .slice(0, ALERT_LIST_SIZE),
    expiring: expiringRows.slice(0, ALERT_LIST_SIZE),
    notSelling: notSelling
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, LIST_SIZE),
    pending: {
      sales: pendingSales,
      purchases: pendingPurchases,
      transfers: pendingTransfers,
      stockCorrections: pendingStockCorrections,
      saleCorrections: pendingSaleCorrections,
    },
  };
};

module.exports = { getBusinessAnalytics };
