const httpStatus = require('http-status');
const { subMonths } = require('date-fns');
const { getIO } = require('../socket/s');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');
const { runStockTransaction } = require('../utils/stockTransaction');
const {
  getAccessibleLocations,
  getShopNotificationRecipients,
} = require('../utils/accessibleLocations');

const getSellById = async (identifier) => {
  const sell = await prisma.sell.findFirst({
    where: {
      OR: [{ id: identifier }, { invoiceNo: identifier }],
    },
    include: {
      branch: true,
      customer: true,
      createdBy: true,
      updatedBy: true,
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
              batch: true,
            },
          },
        },
      },
    },
  });
  return sell;
};
const getSellByIdByuser = async (id, userId = null) => {
  // Get the sell with all items first
  const sell = await prisma.sell.findUnique({
    where: { id },
    include: {
      branch: true,
      customer: true,
      createdBy: true,
      updatedBy: true,
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
              batch: true, // Just include the batch relation directly
            },
          },
        },
      },
    },
  });
  const existingSell = await prisma.sell.findUnique({
    where: { id },
    select: { locked: true, lockedAt: true },
  });

  // If record is unlocked (false), check time validity
  if (existingSell && existingSell.locked === false) {
    // Case 1: lockedAt is missing → lock immediately
    if (!existingSell.lockedAt) {
      return prisma.sell.update({
        where: { id },
        data: {
          locked: true,
          lockedAt: new Date(),
        },
      });
    }

    // Case 2: lockedAt exists → check 20 minutes rule
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);

    if (existingSell.lockedAt < twentyMinutesAgo) {
      return prisma.sell.update({
        where: { id },
        data: {
          locked: true,
          lockedAt: new Date(),
        },
      });
    }
  }

  if (!sell) return null;

  // If userId is provided, filter items and return both versions
  if (userId) {
    const locations = await getAccessibleLocations(userId);
    const userShopIds = locations?.shopIds || [];

    const filteredItems = sell.items.filter((item) =>
      userShopIds.includes(item.shopId),
    );

    return {
      ...sell,
      items: filteredItems,
      // Include metadata about the filtering
      _metadata: {
        totalItems: sell.items.length,
        accessibleItems: filteredItems.length,
        hasRestrictedAccess: filteredItems.length < sell.items.length,
      },
    };
  }

  return sell;
};

// Get Sell by invoice number
const getSellByInvoiceNo = async (invoiceNo) => {
  const sell = await prisma.sell.findFirst({
    where: { invoiceNo },
    include: {
      branch: true,
      customer: true,
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
              batch: true,
            },
          },
        },
      },
    },
  });
  return sell;
};

// Get all Sells
const SALE_STATUS_LABELS = {
  NOT_APPROVED: 'not approved',
  APPROVED: 'approved',
  PARTIALLY_DELIVERED: 'partially delivered',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
};
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 50000;

// Sales list for the dashboard: one page at a time, filtered in the database.
// The status counts and unchecked-correction count cover every sale in the
// date range (not just the page), so the cards stay right however many sales exist.
const getAllSells = async ({
  startDate,
  endDate,
  saleStatus,
  branchId,
  page = 1,
  limit = 10,
  q,
  employeeId,
  unchecked = false,
  exportAll = false,
  withItems = false, // export only: add the item lines (accounting export)
} = {}) => {
  const twelveMonthsAgo = subMonths(new Date(), 12); // Default time range
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Scope of the counts: date range (+ branch)
  const scope = {};
  if (startDateObj && endDateObj) {
    scope.saleDate = { gte: startDateObj, lte: endDateObj };
  } else if (startDateObj) {
    scope.saleDate = { gte: startDateObj, lte: new Date() };
  } else if (endDateObj) {
    scope.saleDate = { gte: twelveMonthsAgo, lte: endDateObj };
  } else {
    scope.saleDate = { gte: twelveMonthsAgo };
  }
  if (branchId) scope.branchId = branchId;

  const uncheckedWhere = {
    SellStockCorrection: {
      some: { OR: [{ isChecked: false }, { isChecked: null }] },
    },
  };

  // The list: scope + every filter
  const filters = [scope];
  if (saleStatus && saleStatus !== 'all') filters.push({ saleStatus });
  if (employeeId && employeeId !== 'all') {
    filters.push({ createdById: employeeId });
  }
  if (unchecked) filters.push(uncheckedWhere);
  const search = (q || '').trim();
  if (search) {
    const lower = search.toLowerCase();
    const matchingStatuses = Object.entries(SALE_STATUS_LABELS)
      .filter(
        ([value, label]) =>
          label.includes(lower) || value.includes(search.toUpperCase()),
      )
      .map(([value]) => value);
    filters.push({
      OR: [
        { invoiceNo: { contains: search } },
        { customer: { is: { name: { contains: search } } } },
        { createdBy: { is: { name: { contains: search } } } },
        ...(matchingStatuses.length > 0
          ? [{ saleStatus: { in: matchingStatuses } }]
          : []),
      ],
    });
  }
  const where = { AND: filters };

  // Export: every matching sale, only the columns the Excel sheet uses
  if (exportAll) {
    const sells = await prisma.sell.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_EXPORT_ROWS,
      select: {
        id: true,
        invoiceNo: true,
        saleStatus: true,
        saleDate: true,
        totalProducts: true,
        subTotal: true,
        discount: true,
        vat: true,
        grandTotal: true,
        NetTotal: true,
        notes: true,
        locked: true,
        createdAt: true,
        updatedAt: true,
        branch: { select: { name: true } },
        customer: withItems
          ? {
              select: {
                id: true,
                name: true,
                companyName: true,
                phone1: true,
                tinNumber: true,
              },
            }
          : { select: { name: true } },
        createdBy: { select: { id: true, name: true } },
        ...(withItems && {
          items: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              product: { select: { productCode: true, name: true } },
              subProduct: { select: { subProductCode: true, name: true } },
              unitOfMeasure: { select: { name: true } },
            },
          },
        }),
      },
    });
    return { sells, count: sells.length };
  }

  const take = Math.min(Math.max(parseInt(limit, 10) || 10, 1), MAX_PAGE_SIZE);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);

  const [sells, count, totalCount, statusGroups, uncheckedCount] =
    await Promise.all([
      prisma.sell.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * take,
        take,
        include: {
          branch: true,
          customer: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          items: {
            include: {
              product: {
                include: {
                  unitOfMeasure: true,
                  category: true,
                },
              },
              shop: true,
              unitOfMeasure: true,
              batches: {
                include: {
                  batch: true,
                },
              },
            },
          },
          SellStockCorrection: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              isChecked: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      }),
      prisma.sell.count({ where }),
      prisma.sell.count({ where: scope }),
      prisma.sell.groupBy({
        by: ['saleStatus'],
        where: scope,
        _count: { _all: true },
      }),
      prisma.sell.count({ where: { AND: [scope, uncheckedWhere] } }),
    ]);

  const statusCounts = Object.keys(SALE_STATUS_LABELS).reduce(
    (acc, status) => ({ ...acc, [status]: 0 }),
    {},
  );
  statusGroups.forEach((group) => {
    // eslint-disable-next-line no-underscore-dangle
    statusCounts[group.saleStatus] = group._count._all;
  });

  return {
    sells,
    count, // sales matching every filter (for pagination)
    totalCount, // all sales in the date range
    statusCounts,
    uncheckedCount,
    page: currentPage,
    limit: take,
  };
};

const INVOICE_NUMBER_PATTERN = /INV-?(\d+)/i;
const INVOICE_CANDIDATE_SAMPLE = 20;
const INVOICE_FREE_SLOT_ATTEMPTS = 50;

const parseInvoiceNumber = (invoiceNo) => {
  const match = invoiceNo ? invoiceNo.match(INVOICE_NUMBER_PATTERN) : null;
  if (!match || !match[1]) return 0;
  const numericPart = parseInt(match[1], 10);
  return Number.isNaN(numericPart) ? 0 : numericPart;
};

const formatInvoiceNumber = (number) =>
  `INV-${number.toString().padStart(5, '0')}`;

// Next invoice number = highest existing INV number + 1, formatted INV-00001.
// Only a small sample is read instead of every sale: the newest sales (which
// cover the sequence once numbers outgrow 5 digits and string order breaks)
// and the highest invoiceNo values in string order. A number that is already
// taken (e.g. an invoice edited by hand) is skipped. Concurrent callers can
// still get the same number; createSell retries on the unique violation.
const generateInvoiceNumber = async () => {
  const [newest, highest] = await Promise.all([
    prisma.sell.findMany({
      select: { invoiceNo: true },
      orderBy: { createdAt: 'desc' },
      take: INVOICE_CANDIDATE_SAMPLE,
    }),
    prisma.sell.findMany({
      where: { invoiceNo: { startsWith: 'INV' } },
      select: { invoiceNo: true },
      orderBy: { invoiceNo: 'desc' },
      take: INVOICE_CANDIDATE_SAMPLE,
    }),
  ]);

  const maxNumber = [...newest, ...highest].reduce(
    (max, sell) => Math.max(max, parseInvoiceNumber(sell.invoiceNo)),
    0,
  );

  let nextNumber = maxNumber + 1;
  for (let i = 0; i < INVOICE_FREE_SLOT_ATTEMPTS; i += 1) {
    const candidate = formatInvoiceNumber(nextNumber);
    // eslint-disable-next-line no-await-in-loop
    const taken = await prisma.sell.findUnique({
      where: { invoiceNo: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    nextNumber += 1;
  }
  return formatInvoiceNumber(nextNumber);
};

// True when a Prisma error is the unique violation on sells.invoiceNo
const isInvoiceNoConflict = (error) => {
  if (!error || error.code !== 'P2002') return false;
  const target = error.meta && error.meta.target;
  if (Array.isArray(target)) return target.includes('invoiceNo');
  return (
    typeof target === 'string' &&
    (target.includes('invoiceNo') || target === 'sells_invoiceNo_key')
  );
};

const INVOICE_CREATE_ATTEMPTS = 5;

// Sale prices are floats; compare to the cent instead of with ===
const MONEY_EPSILON = 0.005;
const isSameMoneyAmount = (a, b) =>
  Math.abs(Number(a) - Number(b)) < MONEY_EPSILON;

// A sale line is auto-approved only when its unit price is one of the
// additional prices the POS offers for that product / sub-product at the
// line's shop: one set for that shop or for all shops (no shop) -
// product-level ones, plus the sub-product's own. The standard sell price is
// not offered in the POS, so a line sold at it (or any other price) leaves
// the sale NOT_APPROVED for someone to approve.
const isListedPrice = (product, subProduct, item, unitPrice) => {
  const forThisShop = (ap) => ap.shopId === null || ap.shopId === item.shopId;
  const productPrices = (product.AdditionalPrice || []).filter(
    (ap) =>
      forThisShop(ap) &&
      (!ap.subProductId ||
        (item.subProductId && ap.subProductId === item.subProductId)),
  );
  const subProductPrices = (
    (subProduct && subProduct.additionalPrices) ||
    []
  ).filter(forThisShop);
  return [...productPrices, ...subProductPrices].some((ap) =>
    isSameMoneyAmount(ap.price, unitPrice),
  );
};

// Validate stock across ALL lines of a sale, not line by line, so two lines
// for the same product/subproduct in the same shop cannot each claim the
// same units. Lines with a subProduct may only use that subProduct's batches;
// lines without one may use any batch of the product, so the product-level
// total is checked as well.
const assertAggregateStockAvailable = (items, shopStocks) => {
  const sumAvailable = (shopId, productId, subProductId) =>
    shopStocks
      .filter(
        (stock) =>
          stock.shopId === shopId &&
          stock.batch.productId === productId &&
          (!subProductId || stock.batch.subProductId === subProductId),
      )
      .reduce((sum, stock) => sum + stock.quantity, 0);

  const subProductTotals = new Map();
  const productTotals = new Map();

  items.forEach((item) => {
    const quantity = Number(item.quantity);
    const productKey = `${item.shopId}|${item.productId}`;
    const productEntry = productTotals.get(productKey) || {
      shopId: item.shopId,
      productId: item.productId,
      requested: 0,
    };
    productEntry.requested += quantity;
    productTotals.set(productKey, productEntry);

    if (item.subProductId) {
      const subKey = `${productKey}|${item.subProductId}`;
      const subEntry = subProductTotals.get(subKey) || {
        shopId: item.shopId,
        productId: item.productId,
        subProductId: item.subProductId,
        requested: 0,
      };
      subEntry.requested += quantity;
      subProductTotals.set(subKey, subEntry);
    }
  });

  subProductTotals.forEach((entry) => {
    const available = sumAvailable(
      entry.shopId,
      entry.productId,
      entry.subProductId,
    );
    if (entry.requested > available) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Total requested quantity (${entry.requested}) exceeds available stock (${available}) in shop for this SubProduct`,
      );
    }
  });

  productTotals.forEach((entry) => {
    const available = sumAvailable(entry.shopId, entry.productId, null);
    if (entry.requested > available) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Total requested quantity (${entry.requested}) exceeds available stock (${available}) in shop for this Product`,
      );
    }
  });
};

// Create Sell
const createSell = async (sellBody, userId) => {
  console.log('📝 Creating sell with body:', JSON.stringify(sellBody, null, 2));

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    console.log('✅ User found:', user.id);

    const { items: itemsString, ...restSellBody } = sellBody;
    const items =
      typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Sale must have at least one item',
      );
    }
    console.log(`📦 Processing ${items.length} items`);

    // Check if discount exists
    const checkdiscount = restSellBody.discount || 0;
    const hasDiscount = checkdiscount > 0;

    // Extract product IDs, subproduct IDs, and shop IDs from items
    const productIds = items.map((item) => item.productId).filter(Boolean);
    const subProductIds = items
      .map((item) => item.subProductId)
      .filter(Boolean);
    const shopIds = items.map((item) => item.shopId).filter(Boolean);

    console.log('🔍 Extracted IDs:', {
      productIds,
      subProductIds,
      shopIds,
    });

    if (productIds.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'All items must have a productId',
      );
    }

    if (shopIds.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'All items must have a shopId',
      );
    }

    // Fetch products with their additional prices and unit of measure
    console.log('🔍 Fetching products...');
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        unitOfMeasure: true,
        subCategory: true,
        AdditionalPrice: {
          where: {
            OR: [{ shopId: null }, { shopId: { in: shopIds } }],
          },
          include: {
            subProduct: true,
          },
        },
      },
    });
    console.log(`✅ Found ${products.length} products`);

    // Fetch subproducts if any are provided - FIXED: removed unitOfMeasure include
    let subProducts = [];
    if (subProductIds.length > 0) {
      console.log('🔍 Fetching subproducts...');
      subProducts = await prisma.subProduct.findMany({
        where: { id: { in: subProductIds } },
        include: {
          product: true,
          // REMOVED: unitOfMeasure: true, - This field doesn't exist in SubProduct model
          additionalPrices: {
            where: {
              OR: [{ shopId: null }, { shopId: { in: shopIds } }],
            },
          },
        },
      });
      console.log(`✅ Found ${subProducts.length} subproducts`);
    }

    // Fetch available shop stocks for validation
    console.log('🔍 Fetching shop stocks...');
    const shopStocks = await prisma.shopStock.findMany({
      where: {
        shopId: { in: shopIds },
        status: 'Available',
        quantity: { gt: 0 },
        batch: {
          productId: { in: productIds },
        },
      },
      include: {
        batch: {
          include: {
            product: true,
            subProduct: true,
          },
        },
        shop: true,
      },
    });
    console.log(`✅ Found ${shopStocks.length} shop stock records`);

    let allItemsApproved = true;
    const enhancedItems = items.map((item, index) => {
      console.log(`🔄 Processing item ${index + 1}:`, item);

      if (!item.productId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} is missing productId`,
        );
      }

      if (!item.shopId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} is missing shopId`,
        );
      }

      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} has invalid productId: ${item.productId}`,
        );
      }

      // Validate subProduct if provided
      let subProduct = null;
      if (item.subProductId) {
        subProduct = subProducts.find((sp) => sp.id === item.subProductId);
        if (!subProduct) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Item ${index + 1} has invalid subProductId: ${item.subProductId}`,
          );
        }

        // Ensure subProduct belongs to the selected product
        if (subProduct.productId !== item.productId) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Item ${
              index + 1
            }: SubProduct does not belong to the selected product`,
          );
        }
        console.log(`✅ Subproduct validated:`, subProduct.id);
      }

      // Check available stock for this product/subproduct in the selected shop
      const availableStock = shopStocks
        .filter((stock) => {
          // Match by product ID
          const productMatch = stock.batch.productId === item.productId;

          // If subProductId is provided, also match by subProduct
          if (item.subProductId) {
            return (
              productMatch &&
              stock.batch.subProductId === item.subProductId &&
              stock.shopId === item.shopId
            );
          }

          // If no subProduct, match only by product
          return productMatch && stock.shopId === item.shopId;
        })
        .reduce((sum, stock) => sum + stock.quantity, 0);

      console.log(`📊 Available stock for item ${index + 1}:`, availableStock);

      if (item.quantity <= 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} has invalid quantity: ${item.quantity}`,
        );
      }

      if (item.quantity > availableStock) {
        const itemIdentifier = item.subProductId ? 'SubProduct' : 'Product';
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} quantity (${
            item.quantity
          }) exceeds available stock (${availableStock}) in shop for this ${itemIdentifier}`,
        );
      }

      // ✅ Ensure unitPrice is converted to a number
      const unitPrice = Number(item.unitPrice);
      if (
        typeof unitPrice !== 'number' ||
        Number.isNaN(unitPrice) ||
        unitPrice < 0
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} has invalid unit price: ${item.unitPrice}`,
        );
      }

      // ✅ PRICE VALIDATION: the same prices the POS offers are auto-approved
      const isPriceValid = isListedPrice(product, subProduct, item, unitPrice);

      // If any item has invalid price, mark the entire sale as not approved
      if (!isPriceValid) {
        allItemsApproved = false;
      }

      // Always use the product unit (ignore the client value): stock is
      // deducted 1:1 in the product unit, with no conversion. Same as purchases.
      const { unitOfMeasureId } = product;

      return {
        ...item,
        productId: item.productId,
        subProductId: item.subProductId || null,
        shopId: item.shopId,
        unitOfMeasureId,
        unitPrice,
        isPriceValid,
        availableStock,
      };
    });

    // Per-line checks above can each pass while the lines together exceed stock
    assertAggregateStockAvailable(enhancedItems, shopStocks);

    const subTotal = enhancedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const discount = restSellBody.discount || 0;
    const vat = restSellBody.vat || 0;
    const grandTotal = subTotal - discount + vat;

    console.log('💰 Calculated totals:', {
      subTotal,
      discount,
      vat,
      grandTotal,
      allItemsApproved,
      hasDiscount,
    });

    // Determine sale status based on price validation
    const saleStatus =
      allItemsApproved && !hasDiscount ? 'APPROVED' : 'NOT_APPROVED';

    console.log('📊 Sale status:', saleStatus);

    // Create the sell record. invoiceNo is unique and numbers are handed out
    // as max+1, so a concurrent sale can take the same number first: on that
    // conflict regenerate the number and retry. Other errors are not retried.
    console.log('💾 Creating sell record...');

    try {
      let sell = null;
      for (let attempt = 1; !sell; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const invoiceNo = await generateInvoiceNumber();
        console.log('🔢 Generated invoice number:', invoiceNo);
        try {
          // eslint-disable-next-line no-await-in-loop
          sell = await prisma.sell.create({
            data: {
              invoiceNo,
              customerId: restSellBody.customerId,
              totalProducts: enhancedItems.length,
              subTotal,
              discount,
              vat,
              grandTotal,
              NetTotal: grandTotal,
              saleStatus,
              saleDate: restSellBody.saleDate
                ? new Date(restSellBody.saleDate)
                : new Date(),
              notes: restSellBody.notes,
              branchId: user.branchId,
              createdById: userId,
              updatedById: userId,
              items: {
                create: enhancedItems.map((item) => ({
                  productId: item.productId,
                  subProductId: item.subProductId,
                  shopId: item.shopId,
                  unitOfMeasureId: item.unitOfMeasureId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  totalPrice: item.unitPrice * item.quantity,
                  itemSaleStatus: 'PENDING',
                })),
              },
            },
            include: {
              branch: true,
              customer: true,
              createdBy: { select: { id: true, name: true, email: true } },
              items: {
                include: {
                  product: {
                    include: {
                      unitOfMeasure: true,
                      category: true,
                      subCategory: true,
                    },
                  },
                  subProduct: {
                    // Removed include for unitOfMeasure since it doesn't exist
                  },
                  unitOfMeasure: true,
                  shop: true,
                },
              },
            },
          });
        } catch (createError) {
          if (
            !isInvoiceNoConflict(createError) ||
            attempt >= INVOICE_CREATE_ATTEMPTS
          ) {
            throw createError;
          }
          console.warn(
            `Invoice number ${invoiceNo} was taken concurrently, retrying (${attempt}/${INVOICE_CREATE_ATTEMPTS})`,
          );
          // Small random backoff so racing requests do not collide again
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            setTimeout(resolve, Math.floor(Math.random() * 25 * attempt));
          });
        }
      }

      console.log('✅ Sell created successfully with ID:', sell.id);

      // Notification logic
      if (saleStatus === 'APPROVED') {
        console.log('🔔 Sending notifications for approved sale...');
        try {
          const uniqueShopIds = sell.items
            .map((item) => item.shopId)
            .filter(Boolean)
            .filter((shopId, index, array) => array.indexOf(shopId) === index);

          const usersWithShopAccess = await getShopNotificationRecipients(
            uniqueShopIds,
          );

          const shopNotifications = await Promise.allSettled(
            uniqueShopIds.map((shopId) =>
              prisma.notification.create({
                data: {
                  shopId,
                  title: 'Sale Approved - Prepare for Delivery',
                  message: `Sale #${sell.invoiceNo} has been approved and is ready for delivery preparation`,
                  type: 'SELL_READY_FOR_DELIVERY',
                  relatedEntityType: 'SELL',
                },
              }),
            ),
          );

          const io = getIO();
          const realTimeNotification = {
            title: 'New Sale Approved',
            message: `Sale #${sell.invoiceNo} has been approved and needs delivery preparation`,
            type: 'SELL_READY_FOR_DELIVERY',
            relatedEntityType: 'SELL',
            saleId: sell.id,
            invoiceNo: sell.invoiceNo,
            timestamp: new Date().toISOString(),
          };

          usersWithShopAccess.forEach((user) => {
            io.to(user.id).emit('new-notification', realTimeNotification);
            user.shops.forEach((shop) => {
              io.to(`${user.id}:${shop.id}`).emit(
                'new-notification',
                realTimeNotification,
              );
            });
          });

          const successfulShopCount = shopNotifications.filter(
            (result) => result.status === 'fulfilled',
          ).length;

          console.log(
            `📢 Successfully processed notifications for ${successfulShopCount} shops and ${usersWithShopAccess.length} users for approved sale #${sell.invoiceNo}`,
          );
        } catch (notificationError) {
          console.error(
            '❌ Unexpected error in notification process:',
            notificationError,
          );
        }
      }

      return sell;
    } catch (dbError) {
      console.error('❌ Database error creating sell:', dbError);

      // Check for specific Prisma errors
      if (dbError.code === 'P2002') {
        throw new ApiError(
          httpStatus.CONFLICT,
          `Duplicate entry: ${dbError.meta?.target}`,
        );
      } else if (dbError.code === 'P2003') {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Foreign key constraint failed: ${dbError.meta?.field_name}`,
        );
      }

      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `Database error: ${dbError.message}`,
      );
    }
  } catch (error) {
    console.error('❌ Error in createSell:', error);

    // If it's already an ApiError, rethrow it
    if (error instanceof ApiError) {
      throw error;
    }

    // Otherwise, wrap it in an ApiError
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'An unexpected error occurred',
    );
  }
};
const updateSell = async (sellId, sellBody, userId) => {
  console.log(
    '📝 Updating sell with ID:',
    sellId,
    'Body:',
    JSON.stringify(sellBody, null, 2),
  );

  try {
    // Check if sell exists
    const existingSell = await getSellById(sellId);
    if (!existingSell) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
    }

    if (existingSell.locked === true) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot update locked sale');
    }

    if (
      ['DELIVERED', 'PARTIALLY_DELIVERED', 'CANCELLED'].includes(
        existingSell.saleStatus,
      )
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot update ${existingSell.saleStatus.toLowerCase()} sale`,
      );
    }

    if (sellBody.invoiceNo && sellBody.invoiceNo !== existingSell.invoiceNo) {
      if (await getSellByInvoiceNo(sellBody.invoiceNo)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Invoice number already taken',
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    console.log('✅ User found:', user.id);

    const { items: itemsString, ...restSellBody } = sellBody;
    const items =
      typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Sale must have at least one item',
      );
    }
    console.log(`📦 Processing ${items.length} items for update`);

    const newDiscount =
      restSellBody.discount !== undefined
        ? Number(restSellBody.discount)
        : existingSell.discount;

    const existingDiscountWasZero = existingSell.discount === 0;
    const newDiscountIsZero = newDiscount === 0;
    const discountChangedFromZeroToNonZero =
      existingDiscountWasZero && !newDiscountIsZero;
    const discountChangedFromNonZeroToZero =
      !existingDiscountWasZero && newDiscountIsZero;

    const hasDiscount = newDiscount > 0;

    const productIds = items.map((item) => item.productId).filter(Boolean);
    const subProductIds = items
      .map((item) => item.subProductId)
      .filter(Boolean);
    const shopIds = items.map((item) => item.shopId).filter(Boolean);

    console.log('🔍 Extracted IDs for update:', {
      productIds,
      subProductIds,
      shopIds,
    });

    if (productIds.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'All items must have a productId',
      );
    }

    if (shopIds.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'All items must have a shopId',
      );
    }

    console.log('🔍 Fetching products for update...');
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        unitOfMeasure: true,
        subCategory: true,
        AdditionalPrice: {
          where: {
            OR: [{ shopId: null }, { shopId: { in: shopIds } }],
          },
          include: {
            subProduct: true,
          },
        },
      },
    });
    console.log(`✅ Found ${products.length} products`);

    // FIXED: Removed unitOfMeasure include from subProducts query
    let subProducts = [];
    if (subProductIds.length > 0) {
      console.log('🔍 Fetching subproducts for update...');
      subProducts = await prisma.subProduct.findMany({
        where: { id: { in: subProductIds } },
        include: {
          product: true,
          // REMOVED: unitOfMeasure: true - This field doesn't exist in SubProduct model
          additionalPrices: {
            where: {
              OR: [{ shopId: null }, { shopId: { in: shopIds } }],
            },
          },
        },
      });
      console.log(`✅ Found ${subProducts.length} subproducts`);
    }

    console.log('🔍 Fetching shop stocks for update...');
    const shopStocks = await prisma.shopStock.findMany({
      where: {
        shopId: { in: shopIds },
        status: 'Available',
        quantity: { gt: 0 },
        batch: {
          productId: { in: productIds },
        },
      },
      include: {
        batch: {
          include: {
            product: true,
            subProduct: true,
          },
        },
        shop: true,
      },
    });
    console.log(`✅ Found ${shopStocks.length} shop stock records`);

    let allItemsApproved = true;
    const enhancedItems = items.map((item, index) => {
      console.log(`🔄 Processing item ${index + 1} for update:`, item);

      if (!item.productId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} is missing productId`,
        );
      }

      if (!item.shopId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} is missing shopId`,
        );
      }

      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} has invalid productId: ${item.productId}`,
        );
      }

      let subProduct = null;
      if (item.subProductId) {
        subProduct = subProducts.find((sp) => sp.id === item.subProductId);
        if (!subProduct) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Item ${index + 1} has invalid subProductId: ${item.subProductId}`,
          );
        }

        if (subProduct.productId !== item.productId) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Item ${
              index + 1
            }: SubProduct does not belong to the selected product`,
          );
        }
        console.log(`✅ Subproduct validated for update:`, subProduct.id);
      }

      // Calculate available stock with existing quantities
      const availableStock = shopStocks
        .filter((stock) => {
          const productMatch = stock.batch.productId === item.productId;
          if (item.subProductId) {
            return (
              productMatch &&
              stock.batch.subProductId === item.subProductId &&
              stock.shopId === item.shopId
            );
          }
          return productMatch && stock.shopId === item.shopId;
        })
        .reduce((sum, stock) => sum + stock.quantity, 0);

      // Stock is only deducted on delivery, and only NOT_APPROVED/APPROVED
      // sales (all items PENDING) can be updated, so the existing lines hold
      // no stock. Adding their quantity back here would allow overselling.
      const adjustedAvailableStock = availableStock;

      console.log(
        `📊 Available stock for item ${index + 1}:`,
        adjustedAvailableStock,
      );

      if (item.quantity <= 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} has invalid quantity: ${item.quantity}`,
        );
      }

      if (item.quantity > adjustedAvailableStock) {
        const itemIdentifier = item.subProductId ? 'SubProduct' : 'Product';
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} quantity (${
            item.quantity
          }) exceeds available stock (${adjustedAvailableStock}) in shop for this ${itemIdentifier}`,
        );
      }

      const unitPrice = Number(item.unitPrice);
      if (
        typeof unitPrice !== 'number' ||
        Number.isNaN(unitPrice) ||
        unitPrice < 0
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${index + 1} has invalid unit price: ${item.unitPrice}`,
        );
      }

      // ✅ PRICE VALIDATION: the same prices the POS offers are auto-approved
      const isPriceValid = isListedPrice(product, subProduct, item, unitPrice);

      if (!isPriceValid) {
        allItemsApproved = false;
      }

      // Always use the product unit (ignore the client value): stock is
      // deducted 1:1 in the product unit, with no conversion. Same as purchases.
      const { unitOfMeasureId } = product;

      return {
        ...item,
        productId: item.productId,
        subProductId: item.subProductId || null,
        shopId: item.shopId,
        unitOfMeasureId,
        unitPrice,
        isPriceValid,
        availableStock: adjustedAvailableStock,
      };
    });

    // Per-line checks above can each pass while the lines together exceed stock
    assertAggregateStockAvailable(enhancedItems, shopStocks);

    const subTotal = enhancedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const discount = newDiscount;
    const vat = restSellBody.vat || existingSell.vat || 0;
    const grandTotal = subTotal - discount + vat;

    console.log('💰 Calculated totals for update:', {
      subTotal,
      discount,
      vat,
      grandTotal,
      allItemsApproved,
      hasDiscount,
    });

    let saleStatus;

    if (discountChangedFromZeroToNonZero) {
      saleStatus = 'NOT_APPROVED';
    } else if (discountChangedFromNonZeroToZero) {
      saleStatus = allItemsApproved ? 'APPROVED' : 'NOT_APPROVED';
    } else if (hasDiscount) {
      saleStatus = 'NOT_APPROVED';
    } else {
      saleStatus = allItemsApproved ? 'APPROVED' : 'NOT_APPROVED';
    }

    console.log('📊 Updated sale status:', saleStatus);

    console.log('💾 Updating sell record in transaction...');
    const result = await runStockTransaction(async (tx) => {
      // Re-check the status atomically (and lock the sale row) so a delivery,
      // cancellation or lock that happened since the read above is not undone
      const guard = await tx.sell.updateMany({
        where: {
          id: sellId,
          saleStatus: { in: ['NOT_APPROVED', 'APPROVED'] },
          locked: false,
        },
        data: { updatedById: userId },
      });
      if (guard.count !== 1) {
        throw new ApiError(
          httpStatus.CONFLICT,
          'Sale was changed by another request (delivered, cancelled or locked). Reload and try again.',
        );
      }

      // Delete all existing items
      await tx.sellItem.deleteMany({
        where: { sellId },
      });
      console.log('✅ Deleted existing items');

      // Update sell with new items
      const sell = await tx.sell.update({
        where: { id: sellId },
        data: {
          customerId: restSellBody.customerId || existingSell.customerId,
          totalProducts: enhancedItems.length,
          subTotal,
          discount,
          vat,
          grandTotal,
          NetTotal: grandTotal,
          saleStatus,
          saleDate: restSellBody.saleDate
            ? new Date(restSellBody.saleDate)
            : existingSell.saleDate,
          notes: restSellBody.notes || existingSell.notes,
          updatedById: userId,
          items: {
            create: enhancedItems.map((item) => ({
              productId: item.productId,
              subProductId: item.subProductId,
              shopId: item.shopId,
              unitOfMeasureId: item.unitOfMeasureId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice * item.quantity,
              itemSaleStatus: 'PENDING',
            })),
          },
        },
        include: {
          branch: true,
          customer: true,
          createdBy: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: {
                include: {
                  unitOfMeasure: true,
                  category: true,
                  subCategory: true,
                },
              },
              subProduct: {
                // FIXED: Removed unitOfMeasure include since it doesn't exist
              },
              unitOfMeasure: true,
              shop: true,
            },
          },
        },
      });

      console.log('✅ Sell updated successfully with ID:', sell.id);
      return sell;
    });

    // Notification logic
    if (existingSell.saleStatus !== 'APPROVED' && saleStatus === 'APPROVED') {
      console.log('🔔 Sending notifications for approved sale update...');
      try {
        const uniqueShopIds = result.items
          .map((item) => item.shopId)
          .filter(Boolean)
          .filter((shopId, index, array) => array.indexOf(shopId) === index);

        const usersWithShopAccess = await getShopNotificationRecipients(
          uniqueShopIds,
        );

        const shopNotifications = await Promise.allSettled(
          uniqueShopIds.map((shopId) =>
            prisma.notification.create({
              data: {
                shopId,
                title: 'Sale Approved - Prepare for Delivery',
                message: `Sale #${result.invoiceNo} has been approved and is ready for delivery preparation`,
                type: 'SELL_READY_FOR_DELIVERY',
                relatedEntityType: 'SELL',
              },
            }),
          ),
        );

        const io = getIO();
        const realTimeNotification = {
          title: 'Sale Updated & Approved',
          message: `Sale #${result.invoiceNo} has been updated and approved, ready for delivery preparation`,
          type: 'SELL_READY_FOR_DELIVERY',
          relatedEntityType: 'SELL',
          saleId: result.id,
          invoiceNo: result.invoiceNo,
          timestamp: new Date().toISOString(),
        };

        usersWithShopAccess.forEach((user) => {
          io.to(user.id).emit('new-notification', realTimeNotification);
          user.shops.forEach((shop) => {
            io.to(`${user.id}:${shop.id}`).emit(
              'new-notification',
              realTimeNotification,
            );
          });
        });

        const successfulShopCount = shopNotifications.filter(
          (result) => result.status === 'fulfilled',
        ).length;

        console.log(
          `📢 Successfully processed notifications for ${successfulShopCount} shops and ${usersWithShopAccess.length} users for updated & approved sale #${result.invoiceNo}`,
        );
      } catch (notificationError) {
        console.error(
          '❌ Unexpected error in notification process:',
          notificationError,
        );
      }
    }

    return result;
  } catch (error) {
    console.error('❌ Error in updateSell:', error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'An unexpected error occurred during update',
    );
  }
};
// Delete Sell
const deleteSell = async (id, userId) => {
  const existingSell = await getSellById(id);
  if (!existingSell) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }
  if (existingSell.locked === true) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot update locked sale');
  }

  // Delete the sell with stock reversal
  await runStockTransaction(async (tx) => {
    // Lock the sale row first (delivery locks the same row), so a concurrent
    // delivery or a second delete can't change the items while we reverse
    // them. Must be the first statement so the reads below see committed data.
    const locked = await tx.$queryRaw`
      SELECT _id FROM sells WHERE _id = ${id} AND locked = false FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'Sale was already deleted or locked, please reload',
      );
    }

    // Get all sell items with their batches
    const sellItemsWithBatches = await tx.sellItem.findMany({
      where: { sellId: id },
      include: {
        batches: {
          include: {
            batch: true,
          },
        },
        shop: true,
        unitOfMeasure: true,
      },
    });

    // Prepare operations for stock reversal
    const reversalOperations = [];

    // Reverse stock for each delivered item
    sellItemsWithBatches.forEach((sellItem) => {
      // Only reverse stock if the item was delivered (has batches)
      if (
        sellItem.batches.length > 0 &&
        sellItem.itemSaleStatus === 'DELIVERED'
      ) {
        sellItem.batches.forEach((sellItemBatch) => {
          const quantityToRestore = sellItemBatch.quantity;

          // Restore stock to shop for this specific batch
          reversalOperations.push(
            tx.shopStock.update({
              where: {
                shopId_batchId: {
                  shopId: sellItem.shopId,
                  batchId: sellItemBatch.batchId,
                },
              },
              data: {
                quantity: { increment: quantityToRestore },
              },
            }),
          );

          // Create reverse stock ledger entry (IN movement to reverse the OUT)
          reversalOperations.push(
            tx.stockLedger.create({
              data: {
                batchId: sellItemBatch.batchId,
                shopId: sellItem.shopId,
                movementType: 'IN',
                quantity: quantityToRestore,
                unitOfMeasureId: sellItem.unitOfMeasureId,
                reference: `Sell-Delete-${existingSell.invoiceNo}`,
                sourceType: 'SALE',
                sourceId: existingSell.id,
                userId,
                notes: `Sale deletion - Stock reversal for Item: ${sellItem.id}`,
                movementDate: new Date(),
              },
            }),
          );
        });
      }
    });

    // Delete all sell item batches first (due to foreign key constraints)
    const sellItemIds = sellItemsWithBatches.map((item) => item.id);
    if (sellItemIds.length > 0) {
      await tx.sellItemBatch.deleteMany({
        where: {
          sellItemId: { in: sellItemIds },
        },
      });
    }

    // Execute stock reversal operations if any
    if (reversalOperations.length > 0) {
      await Promise.all(reversalOperations);
    }

    // Delete all sell items
    await tx.sellItem.deleteMany({
      where: { sellId: id },
    });

    // Delete the sell
    await tx.sell.delete({
      where: { id },
    });

    // Create log entry for the deletion with stock reversal info
    const deliveredItems = sellItemsWithBatches.filter(
      (item) => item.itemSaleStatus === 'DELIVERED' && item.batches.length > 0,
    );

    let logMessage = `Sale ${existingSell.invoiceNo} deleted`;

    if (deliveredItems.length > 0) {
      const totalItemsReversed = deliveredItems.length;
      const totalBatchesReversed = deliveredItems.reduce(
        (sum, item) => sum + item.batches.length,
        0,
      );
      const totalQuantityReversed = deliveredItems.reduce(
        (sum, item) =>
          sum +
          item.batches.reduce((itemSum, batch) => itemSum + batch.quantity, 0),
        0,
      );

      logMessage += ` - Stock reversed: ${totalItemsReversed} items, ${totalBatchesReversed} batches, ${totalQuantityReversed} units`;
    }

    await tx.log.create({
      data: {
        action: logMessage,
        userId,
      },
    });
  });

  return { message: 'Sale deleted successfully with stock reversal' };
};

const completeSaleDelivery = async (saleId, deliveryData, userId) => {
  const sell = await getSellById(saleId);

  if (!sell) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  // Validate delivery data structure
  if (
    !deliveryData ||
    !Array.isArray(deliveryData.items) ||
    deliveryData.items.length === 0
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invalid delivery data format. Expected items array.',
    );
  }

  const deliverableSaleStatuses = ['APPROVED', 'PARTIALLY_DELIVERED'];
  if (!deliverableSaleStatuses.includes(sell.saleStatus)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot deliver items of a sale in status ${sell.saleStatus}. Sale must be APPROVED or PARTIALLY_DELIVERED.`,
    );
  }

  const requestedItemIds = deliveryData.items.map((item) => item.itemId);
  if (new Set(requestedItemIds).size !== requestedItemIds.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'The same item is listed more than once in the delivery data',
    );
  }

  return runStockTransaction(async (tx) => {
    // Compare-and-set on the sale row first: re-checks the status atomically
    // and locks the row, so a concurrent cancel/status change cannot slip in.
    const saleGuard = await tx.sell.updateMany({
      where: { id: saleId, saleStatus: { in: deliverableSaleStatuses } },
      data: { updatedById: userId },
    });
    if (saleGuard.count !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Sale is no longer APPROVED or PARTIALLY_DELIVERED and cannot be delivered',
      );
    }

    // Get all unit of measures for the sale items
    const unitOfMeasureIds = sell.items.map((item) => item.unitOfMeasureId);
    const unitOfMeasures = await tx.unitOfMeasure.findMany({
      where: { id: { in: unitOfMeasureIds } },
    });

    const unitOfMeasureMap = unitOfMeasures.reduce((acc, uom) => {
      acc[uom.id] = uom;
      return acc;
    }, {});

    // Get sell items that are being delivered
    const sellItemsToDeliver = await tx.sellItem.findMany({
      where: {
        id: { in: requestedItemIds },
        sellId: saleId,
      },
    });

    if (sellItemsToDeliver.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No valid items found for delivery. Please check the provided item IDs.',
      );
    }

    // Validate all items and batches first
    deliveryData.items.forEach((deliveryItem) => {
      const sellItem = sellItemsToDeliver.find(
        (item) => item.id === deliveryItem.itemId,
      );

      if (!sellItem) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${deliveryItem.itemId} not found in sale`,
        );
      }

      const unitOfMeasure = unitOfMeasureMap[sellItem.unitOfMeasureId];

      if (!unitOfMeasure) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Unit of measure not found for item ${sellItem.id}`,
        );
      }

      // Fast-fail on a stale status; the authoritative check is the
      // compare-and-set below
      if (sellItem.itemSaleStatus !== 'PENDING') {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Cannot deliver item ${sellItem.id} from current status: ${sellItem.itemSaleStatus}. Item must be in PENDING status to be delivered.`,
        );
      }

      // Validate that batches exist for this item in delivery data
      if (
        !deliveryItem.batches ||
        !Array.isArray(deliveryItem.batches) ||
        deliveryItem.batches.length === 0
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${sellItem.id} has no batches specified in delivery data`,
        );
      }

      // Validate each batch
      const seenBatchIds = new Set();
      deliveryItem.batches.forEach((batch, index) => {
        if (!batch.batchId) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Batch ${index + 1} for item ${sellItem.id} is missing batchId`,
          );
        }
        if (!Number.isInteger(batch.quantity) || batch.quantity <= 0) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Batch ${batch.batchId} for item ${sellItem.id} has invalid quantity`,
          );
        }
        if (seenBatchIds.has(batch.batchId)) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Batch ${batch.batchId} is listed more than once for item ${sellItem.id}`,
          );
        }
        seenBatchIds.add(batch.batchId);
      });

      // Validate total batch quantities match item quantity
      const totalBatchQuantity = deliveryItem.batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0,
      );
      if (totalBatchQuantity !== sellItem.quantity) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${sellItem.id}: Total batch quantities (${totalBatchQuantity}) do not match item quantity (${sellItem.quantity})`,
        );
      }
    });

    // Compare-and-set each line PENDING -> DELIVERED before touching stock, so
    // two concurrent deliveries of the same line cannot both deduct stock
    // eslint-disable-next-line no-restricted-syntax
    for (const deliveryItem of deliveryData.items) {
      // eslint-disable-next-line no-await-in-loop
      const flipped = await tx.sellItem.updateMany({
        where: {
          id: deliveryItem.itemId,
          sellId: saleId,
          itemSaleStatus: 'PENDING',
        },
        data: { itemSaleStatus: 'DELIVERED' },
      });
      if (flipped.count !== 1) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${deliveryItem.itemId} already delivered`,
        );
      }
    }

    // Validate that every chosen batch belongs to the line's product
    // (and subproduct, when the line has one)
    const batchIds = [
      ...new Set(
        deliveryData.items.flatMap((deliveryItem) =>
          deliveryItem.batches.map((batch) => batch.batchId),
        ),
      ),
    ];
    const productBatches = await tx.productBatch.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, productId: true, subProductId: true },
    });
    const productBatchMap = productBatches.reduce((acc, batch) => {
      acc[batch.id] = batch;
      return acc;
    }, {});

    deliveryData.items.forEach((deliveryItem) => {
      const sellItem = sellItemsToDeliver.find(
        (item) => item.id === deliveryItem.itemId,
      );
      deliveryItem.batches.forEach((batch) => {
        const productBatch = productBatchMap[batch.batchId];
        if (!productBatch) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Batch ${batch.batchId} not found`,
          );
        }
        if (productBatch.productId !== sellItem.productId) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Batch ${batch.batchId} does not belong to the product of item ${sellItem.id}`,
          );
        }
        if (
          sellItem.subProductId &&
          productBatch.subProductId !== sellItem.subProductId
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Batch ${batch.batchId} does not belong to the subproduct of item ${sellItem.id}`,
          );
        }
      });
    });

    // Deduct stock (guarded, never below zero), record batches and ledger
    // eslint-disable-next-line no-restricted-syntax
    for (const deliveryItem of deliveryData.items) {
      const sellItem = sellItemsToDeliver.find(
        (item) => item.id === deliveryItem.itemId,
      );

      // eslint-disable-next-line no-restricted-syntax
      for (const batch of deliveryItem.batches) {
        const quantityToUse = batch.quantity;

        // Remove stock from shop for this specific batch
        // eslint-disable-next-line no-await-in-loop
        const decremented = await tx.shopStock.updateMany({
          where: {
            shopId: sellItem.shopId,
            batchId: batch.batchId,
            quantity: { gte: quantityToUse },
          },
          data: {
            quantity: { decrement: quantityToUse },
          },
        });
        if (decremented.count !== 1) {
          // eslint-disable-next-line no-await-in-loop
          const current = await tx.shopStock.findUnique({
            where: {
              shopId_batchId: {
                shopId: sellItem.shopId,
                batchId: batch.batchId,
              },
            },
            select: { quantity: true },
          });
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Insufficient stock for batch ${batch.batchId}: available ${
              current ? current.quantity : 0
            }, requested ${quantityToUse}`,
          );
        }

        // Create SellItemBatch record for this item
        // eslint-disable-next-line no-await-in-loop
        await tx.sellItemBatch.create({
          data: {
            sellItemId: deliveryItem.itemId,
            batchId: batch.batchId,
            quantity: quantityToUse,
          },
        });

        // Create stock ledger entry for this batch
        // eslint-disable-next-line no-await-in-loop
        await tx.stockLedger.create({
          data: {
            batchId: batch.batchId,
            shopId: sellItem.shopId,
            movementType: 'OUT',
            quantity: quantityToUse,
            unitOfMeasureId: sellItem.unitOfMeasureId,
            reference: `Sell-${sell.invoiceNo}`,
            sourceType: 'SALE',
            sourceId: sell.id,
            userId,
            notes: `Sale delivery to customer - Item: ${sellItem.id}`,
            movementDate: new Date(),
          },
        });
      }
    }

    const updatedItems = deliveryData.items.map((deliveryItem) => {
      const sellItem = sellItemsToDeliver.find(
        (item) => item.id === deliveryItem.itemId,
      );
      return {
        id: sellItem.id,
        shopId: sellItem.shopId,
        previousStatus: sellItem.itemSaleStatus,
        newStatus: 'DELIVERED',
        batchCount: deliveryItem.batches.length,
        totalQuantity: sellItem.quantity,
      };
    });

    // Recalculate overall sale status based on all item statuses
    const allSaleItems = await tx.sellItem.findMany({
      where: { sellId: saleId },
      include: {
        batches: true,
      },
    });

    const itemStatuses = allSaleItems.map((item) => item.itemSaleStatus);
    let newSaleStatus;

    // Determine overall status based on individual item statuses
    if (itemStatuses.every((status) => status === 'DELIVERED')) {
      newSaleStatus = 'DELIVERED';
    } else if (itemStatuses.every((status) => status === 'CANCELLED')) {
      newSaleStatus = 'CANCELLED';
    } else if (itemStatuses.every((status) => status === 'RETURNED')) {
      newSaleStatus = 'RETURNED';
    } else if (itemStatuses.some((status) => status === 'DELIVERED')) {
      // If any items are delivered, status should be PARTIALLY_DELIVERED (mixed status)
      newSaleStatus = 'PARTIALLY_DELIVERED';
    } else if (itemStatuses.every((status) => status === 'PENDING')) {
      newSaleStatus = 'NOT_APPROVED';
    } else {
      // Default fallback
      newSaleStatus = 'NOT_APPROVED';
    }

    // Update the sale status
    const finalUpdatedSale = await tx.sell.update({
      where: { id: saleId },
      data: {
        saleStatus: newSaleStatus,
        updatedById: userId,
      },
      include: {
        items: {
          include: {
            shop: true,
            product: true,
            unitOfMeasure: true,
            batches: {
              include: {
                batch: true,
              },
            },
          },
        },
        customer: true,
        branch: true,
      },
    });

    // Group delivered items by shop for better logging
    const shopDeliveries = updatedItems.reduce((acc, item) => {
      if (!acc[item.shopId]) {
        acc[item.shopId] = { items: 0, batches: 0, quantity: 0 };
      }
      acc[item.shopId].items += 1;
      acc[item.shopId].batches += item.batchCount;
      acc[item.shopId].quantity += item.totalQuantity;
      return acc;
    }, {});

    // Create log entry for delivered items
    const shopSummary = Object.entries(shopDeliveries)
      .map(
        ([shopId, stats]) => `Shop${shopId}:${stats.items}i,${stats.batches}b`,
      )
      .join('; ');

    await tx.log.create({
      data: {
        action: `Sale ${sell.invoiceNo} delivered: ${shopSummary}`,
        userId,
      },
    });

    return finalUpdatedSale;
  });
};
const deliverAllSaleItems = async (saleId, deliveryData, userId) => {
  const sell = await getSellById(saleId);

  if (!sell) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  // Get all items that can be delivered (PENDING status)
  const deliverableItems = sell.items.filter(
    (item) => item.itemSaleStatus === 'PENDING',
  );

  if (deliverableItems.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No deliverable items found in this sale. All items are either already delivered, cancelled, or returned.',
    );
  }

  return completeSaleDelivery(saleId, deliveryData, userId);
};

const partialSaleDelivery = async (saleId, deliveryData, userId) => {
  return completeSaleDelivery(saleId, deliveryData, userId);
};

// Cancel Sale (Before delivery)
const cancelSale = async (saleId, userId) => {
  const sale = await getSellById(saleId);

  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  if (
    sale.saleStatus === 'DELIVERED' ||
    sale.saleStatus === 'PARTIALLY_DELIVERED'
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot cancel a delivered or partially delivered sale. Use return instead.',
    );
  }

  if (sale.saleStatus === 'CANCELLED') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Sale is already cancelled');
  }

  const cancellableStatuses = ['NOT_APPROVED', 'APPROVED'];

  const updatedSale = await runStockTransaction(async (tx) => {
    // Compare-and-set: a delivery or another cancel may have run since the read
    const flipped = await tx.sell.updateMany({
      where: { id: saleId, saleStatus: { in: cancellableStatuses } },
      data: {
        saleStatus: 'CANCELLED',
        updatedById: userId,
      },
    });
    if (flipped.count !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Sale can no longer be cancelled (it was delivered or cancelled by another request)',
      );
    }

    // Defensive: never cancel a sale that has delivered units, since
    // cancelling does not restore stock
    const deliveredItems = await tx.sellItem.count({
      where: { sellId: saleId, itemSaleStatus: 'DELIVERED' },
    });
    if (deliveredItems > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot cancel a sale with delivered items. Use return instead.',
      );
    }

    // Create log entry
    await tx.log.create({
      data: {
        action: `Cancelled sale ${sale.invoiceNo}`,
        userId,
      },
    });

    return tx.sell.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            shop: true,
          },
        },
        customer: true,
      },
    });
  });

  // ✅ ADD REAL-TIME NOTIFICATIONS HERE - Create cancellation notifications
  try {
    const uniqueShopIds = updatedSale.items
      .map((item) => item.shopId)
      .filter(Boolean)
      .filter((shopId, index, array) => array.indexOf(shopId) === index);

    // Find users who have access to these shops
    const usersWithShopAccess = await getShopNotificationRecipients(
      uniqueShopIds,
    );

    // Create shop notifications (store in database)
    const shopNotifications = await Promise.allSettled(
      uniqueShopIds.map((shopId) =>
        prisma.notification.create({
          data: {
            shopId,
            title: 'Sale Cancelled',
            message: `Sale #${updatedSale.invoiceNo} has been cancelled`,
            type: 'SELL_CANCELLED',
            relatedEntityType: 'SELL',
          },
        }),
      ),
    );

    // Get the Socket.IO instance
    const io = getIO();

    // Create notification object for real-time sending
    const realTimeNotification = {
      title: 'Sale Cancelled',
      message: `Sale #${updatedSale.invoiceNo} has been cancelled`,
      type: 'SELL_CANCELLED',
      relatedEntityType: 'SELL',
      saleId: updatedSale.id,
      invoiceNo: updatedSale.invoiceNo,
      timestamp: new Date().toISOString(),
    };

    // ✅ FIXED: Remove prefixes to match frontend
    // Send real-time notifications to shops
    shopNotifications
      .filter((result, index) => result.status === 'fulfilled')
      .forEach((result, index) => {
        const shopId = uniqueShopIds[index];
        const notification = result.value;

        // Remove 'shop:' prefix to match frontend
        io.to(shopId).emit('new-notification', notification);
      });

    // Send real-time notifications to users with shop access
    usersWithShopAccess.forEach((user) => {
      // Send to each user individually - remove 'user:' prefix
      io.to(user.id).emit('new-notification', realTimeNotification);

      // Also send to user's shops for additional targeting
      user.shops.forEach((shop) => {
        // Remove prefixes to match what frontend will join
        io.to(`${user.id}:${shop.id}`).emit(
          'new-notification',
          realTimeNotification,
        );
      });
    });

    // Log statistics
    const successfulShopCount = shopNotifications.filter(
      (result) => result.status === 'fulfilled',
    ).length;

    console.log(
      `📢 Successfully processed cancellation notifications for ${successfulShopCount} shops and ${usersWithShopAccess.length} users for sale #${updatedSale.invoiceNo}`,
    );
  } catch (notificationError) {
    console.error(
      '❌ Unexpected error in cancellation notification process:',
      notificationError,
    );
    // Don't throw error - the sale was cancelled successfully
  }

  return updatedSale;
};

const updateSaleStatus = async (saleId, newStatus, userId) => {
  const sale = await getSellById(saleId);

  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  // Cancellation has its own guards (no delivered units) and notifications;
  // the dashboard still sends CANCELLED through this endpoint.
  if (newStatus === 'CANCELLED') {
    return cancelSale(saleId, userId);
  }

  // Only approval transitions are allowed here. DELIVERED and
  // PARTIALLY_DELIVERED must go through the delivery endpoints (which move
  // stock); CANCELLED goes through cancelSale.
  const allowedTransitions = {
    NOT_APPROVED: ['APPROVED'],
    APPROVED: ['NOT_APPROVED'],
  };

  if (!allowedTransitions[sale.saleStatus]?.includes(newStatus)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot change status from ${sale.saleStatus} to ${newStatus}`,
    );
  }

  const updatedSale = await runStockTransaction(async (tx) => {
    // Compare-and-set: only flip if the status is still what we validated
    const flipped = await tx.sell.updateMany({
      where: { id: saleId, saleStatus: sale.saleStatus },
      data: {
        saleStatus: newStatus,
        updatedById: userId,
      },
    });
    if (flipped.count !== 1) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `Sale status changed by another request. Cannot change status from ${sale.saleStatus} to ${newStatus}`,
      );
    }

    // Create log entry
    await tx.log.create({
      data: {
        action: `Updated sale ${sale.invoiceNo} status from ${sale.saleStatus} to ${newStatus}`,
        userId,
      },
    });

    return tx.sell.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            shop: true,
          },
        },
        customer: true,
      },
    });
  });

  // ✅ ADD REAL-TIME NOTIFICATIONS HERE - For status changes to APPROVED or CANCELLED
  if (newStatus === 'APPROVED' || newStatus === 'CANCELLED') {
    try {
      const uniqueShopIds = updatedSale.items
        .map((item) => item.shopId)
        .filter(Boolean)
        .filter((shopId, index, array) => array.indexOf(shopId) === index);

      // Find users who have access to these shops
      const usersWithShopAccess = await getShopNotificationRecipients(
        uniqueShopIds,
      );

      // Determine notification type and message based on status
      const notificationConfig = {
        APPROVED: {
          type: 'SELL_READY_FOR_DELIVERY',
          title: 'Sale Approved - Prepare for Delivery',
          message: `Sale #${updatedSale.invoiceNo} has been approved and is ready for delivery preparation`,
          realTimeTitle: 'Sale Approved',
          realTimeMessage: `Sale #${updatedSale.invoiceNo} has been approved and needs delivery preparation`,
        },
        CANCELLED: {
          type: 'SELL_CANCELLED',
          title: 'Sale Cancelled',
          message: `Sale #${updatedSale.invoiceNo} has been cancelled`,
          realTimeTitle: 'Sale Cancelled',
          realTimeMessage: `Sale #${updatedSale.invoiceNo} has been cancelled`,
        },
      };

      const config = notificationConfig[newStatus];

      // Create shop notifications (store in database)
      const shopNotifications = await Promise.allSettled(
        uniqueShopIds.map((shopId) =>
          prisma.notification.create({
            data: {
              shopId,
              title: config.title,
              message: config.message,
              type: config.type,
              relatedEntityType: 'SELL',
            },
          }),
        ),
      );

      // Get the Socket.IO instance
      const io = getIO();

      // Create notification object for real-time sending
      const realTimeNotification = {
        title: config.realTimeTitle,
        message: config.realTimeMessage,
        type: config.type,
        relatedEntityType: 'SELL',
        saleId: updatedSale.id,
        invoiceNo: updatedSale.invoiceNo,
        status: newStatus,
        timestamp: new Date().toISOString(),
      };

      // ✅ FIXED: Remove prefixes to match frontend
      // Send real-time notifications to shops

      // Send real-time notifications to users with shop access
      usersWithShopAccess.forEach((user) => {
        // Send to each user individually - remove 'user:' prefix
        io.to(user.id).emit('new-notification', realTimeNotification);
        console.log(
          `✅ Sent real-time notification to user ${user.name} (${user.id})`,
        );

        // Also send to user's shops for additional targeting
        user.shops.forEach((shop) => {
          // Remove prefixes to match what frontend will join
          io.to(`${user.id}:${shop.id}`).emit(
            'new-notification',
            realTimeNotification,
          );
        });
      });

      // Log statistics
      const successfulShopCount = shopNotifications.filter(
        (result) => result.status === 'fulfilled',
      ).length;

      console.log(
        `📢 Successfully processed ${newStatus.toLowerCase()} notifications for ${successfulShopCount} shops and ${
          usersWithShopAccess.length
        } users for sale #${updatedSale.invoiceNo}`,
      );
    } catch (notificationError) {
      console.error(
        `❌ Unexpected error in ${newStatus.toLowerCase()} notification process:`,
        notificationError,
      );
      // Don't throw error - the sale status was updated successfully
    }
  }

  return updatedSale;
};

const getAllSellsuser = async ({
  startDate,
  endDate,
  userId,
  customerName,
  status,
  page = 1,
  limit = 20,
}) => {
  // Validate required parameters
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Initialize where clause with required condition
  const whereClause = {
    createdById: userId,
  };

  // DETECT DEFAULT VIEW: Check if any filters are applied
  const hasCustomerNameFilter = customerName && customerName.trim();
  const hasStatusFilter = status && status.trim();
  const hasDateFilter = startDate || endDate;

  const isDefaultView =
    !hasStatusFilter && !hasDateFilter && !hasCustomerNameFilter && page === 1;

  // For default view: Show all NOT_APPROVED and PARTIALLY_DELIVERED, plus last 10 DELIVERED
  if (isDefaultView) {
    // Get last 10 delivered sales
    const lastDeliveredQuery = {
      createdById: userId,
      saleStatus: 'DELIVERED',
    };

    // Add date filtering for delivered sales (last 3 months for performance)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    lastDeliveredQuery.createdAt = { gte: threeMonthsAgo };

    const [
      lastDeliveredSells,
      notApprovedSells,
      partiallyDeliveredSells,
      approvedSells,
      cancelledSells,
    ] = await Promise.all([
      // Get last 10 delivered sales
      prisma.sell.findMany({
        where: lastDeliveredQuery,
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          branch: true,
          customer: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
                      product: true,
                    },
                  },
                },
              },
            },
          },
          SellStockCorrection: {
            select: {
              id: true,
              status: true,
              isChecked: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      }),

      // Get all NOT_APPROVED sales
      prisma.sell.findMany({
        where: {
          createdById: userId,
          saleStatus: 'NOT_APPROVED',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          branch: true,
          customer: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
                      product: true,
                    },
                  },
                },
              },
            },
          },
          SellStockCorrection: {
            select: {
              id: true,
              status: true,
              isChecked: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      }),

      // Get all PARTIALLY_DELIVERED sales
      prisma.sell.findMany({
        where: {
          createdById: userId,
          saleStatus: 'PARTIALLY_DELIVERED',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          branch: true,
          customer: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
                      product: true,
                    },
                  },
                },
              },
            },
          },
          SellStockCorrection: {
            select: {
              id: true,
              status: true,
              isChecked: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      }),

      // Get all APPROVED sales
      prisma.sell.findMany({
        where: {
          createdById: userId,
          saleStatus: 'APPROVED',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          branch: true,
          customer: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
                      product: true,
                    },
                  },
                },
              },
            },
          },
          SellStockCorrection: {
            select: {
              id: true,
              status: true,
              isChecked: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      }),

      // Get all CANCELLED sales
      prisma.sell.findMany({
        where: {
          createdById: userId,
          saleStatus: 'CANCELLED',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          branch: true,
          customer: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
                      product: true,
                    },
                  },
                },
              },
            },
          },
          SellStockCorrection: {
            select: {
              id: true,
              status: true,
              isChecked: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      }),
    ]);

    // Combine all results
    const allSells = [
      ...notApprovedSells,
      ...partiallyDeliveredSells,
      ...approvedSells,
      ...cancelledSells,
      ...lastDeliveredSells,
    ];

    // Sort by createdAt descending
    allSells.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply the limit for default view
    const limitedSells = allSells.slice(0, limit);

    // Get counts for each status
    const [
      notApprovedCount,
      partiallyDeliveredCount,
      approvedCount,
      cancelledCount,
      deliveredCount,
    ] = await Promise.all([
      prisma.sell.count({
        where: {
          createdById: userId,
          saleStatus: 'NOT_APPROVED',
        },
      }),
      prisma.sell.count({
        where: {
          createdById: userId,
          saleStatus: 'PARTIALLY_DELIVERED',
        },
      }),
      prisma.sell.count({
        where: {
          createdById: userId,
          saleStatus: 'APPROVED',
        },
      }),
      prisma.sell.count({
        where: {
          createdById: userId,
          saleStatus: 'CANCELLED',
        },
      }),
      prisma.sell.count({
        where: {
          createdById: userId,
          saleStatus: 'DELIVERED',
        },
      }),
    ]);

    return {
      sells: limitedSells,
      count: limitedSells.length,
      totalCount:
        notApprovedCount +
        partiallyDeliveredCount +
        approvedCount +
        cancelledCount +
        deliveredCount,
      isDefaultView: true,
      statusCounts: {
        NOT_APPROVED: notApprovedCount,
        PARTIALLY_DELIVERED: partiallyDeliveredCount,
        APPROVED: approvedCount,
        CANCELLED: cancelledCount,
        DELIVERED: deliveredCount,
      },
    };
  }

  // REGULAR FILTERING LOGIC - NO LIMIT when filtering/searching

  // Handle status filtering
  if (status) {
    if (status.includes(',')) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
      if (statuses.length > 0) {
        whereClause.saleStatus = { in: statuses };
      }
    } else {
      whereClause.saleStatus = status;
    }
  }

  // Handle customer name filtering
  if (customerName && customerName.trim()) {
    const customerNameLower = customerName.trim().toLowerCase();
    whereClause.customer = {
      name: {
        contains: customerNameLower,
        mode: 'insensitive',
      },
    };
  }

  // Handle date filtering
  try {
    if (startDate && endDate) {
      const startOfRange = new Date(startDate);
      const endOfRange = new Date(endDate);

      if (
        Number.isNaN(startOfRange.getTime()) ||
        Number.isNaN(endOfRange.getTime())
      ) {
        throw new Error('Invalid date format');
      }

      startOfRange.setHours(0, 0, 0, 0);
      endOfRange.setHours(23, 59, 59, 999);

      whereClause.createdAt = {
        gte: startOfRange,
        lte: endOfRange,
      };
    } else if (startDate && !endDate) {
      const startOfRange = new Date(startDate);
      if (Number.isNaN(startOfRange.getTime())) {
        throw new Error('Invalid start date format');
      }
      startOfRange.setHours(0, 0, 0, 0);
      whereClause.createdAt = { gte: startOfRange };
    } else if (endDate && !startDate) {
      const endOfRange = new Date(endDate);
      if (Number.isNaN(endOfRange.getTime())) {
        throw new Error('Invalid end date format');
      }
      endOfRange.setHours(23, 59, 59, 999);
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      whereClause.createdAt = {
        gte: twelveMonthsAgo,
        lte: endOfRange,
      };
    } else {
      // When filtering without dates, show all records (no date limit)
      // Remove this else block to show all records regardless of date when filtering
      // If you want to keep some date limit for performance, you can adjust this
    }
  } catch (error) {
    throw new Error(`Invalid date: ${error.message}`);
  }

  // Execute the query WITHOUT pagination when filtering
  const sells = await prisma.sell.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      branch: true,
      customer: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
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
                  product: true,
                },
              },
            },
          },
        },
      },
      SellStockCorrection: {
        select: {
          id: true,
          status: true,
          isChecked: true,
        },
      },
      _count: {
        select: { items: true },
      },
    },
  });

  const totalCount = sells.length;

  return {
    sells, // NO LIMIT applied when filtering
    count: sells.length,
    totalCount,
    isDefaultView: false,
    // Note: When filtering, pagination metadata doesn't apply since we return all results
  };
};
// Shared by the paged dashboard lists below (Own Sales, Store Orders)

// Only what the list tables render; the detail pages load the full sale
const SELL_LIST_INCLUDE = {
  branch: true,
  customer: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  SellStockCorrection: {
    select: {
      id: true,
      status: true,
      isChecked: true,
    },
  },
  _count: {
    select: { items: true },
  },
};

const SELL_STOCK_CORRECTION_STATUSES = [
  'PENDING',
  'APPROVED',
  'PARTIAL',
  'REJECTED',
];

// "a,b" | ['a', 'b'] | 'a' -> ['a', 'b']; 'all' and blanks are dropped
const toFilterList = (value) =>
  (Array.isArray(value) ? value : String(value || '').split(','))
    .map((v) => String(v).trim())
    .filter((v) => v && v !== 'all');

const toPaging = (page, limit) => {
  const take = Math.min(Math.max(parseInt(limit, 10) || 10, 1), MAX_PAGE_SIZE);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  return { take, currentPage, skip: (currentPage - 1) * take };
};

// Sale statuses whose label ("partially delivered") or enum value matches
const saleStatusesMatching = (search) => {
  const lower = search.toLowerCase();
  return Object.entries(SALE_STATUS_LABELS)
    .filter(
      ([value, label]) =>
        label.includes(lower) || value.includes(search.toUpperCase()),
    )
    .map(([value]) => value);
};

const toStatusCounts = (statusGroups) => {
  const statusCounts = Object.keys(SALE_STATUS_LABELS).reduce(
    (acc, status) => ({ ...acc, [status]: 0 }),
    {},
  );
  statusGroups.forEach((group) => {
    // eslint-disable-next-line no-underscore-dangle
    statusCounts[group.saleStatus] = group._count._all;
  });
  return statusCounts;
};

// Own Sales (/dashboard/UserBasedSell): one page of the logged-in user's sales.
// The counts cover every sale the user created in the date range.
const getAllSellsuserweb = async ({
  startDate,
  endDate,
  userId,
  customerName,
  status,
  q,
  page = 1,
  limit = 10,
}) => {
  // Validate required parameters
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Date range on createdAt (whole days); no dates = the last 2 months
  let createdAt;
  try {
    if (startDate && endDate) {
      const startOfRange = new Date(startDate);
      const endOfRange = new Date(endDate);

      if (
        Number.isNaN(startOfRange.getTime()) ||
        Number.isNaN(endOfRange.getTime())
      ) {
        throw new Error('Invalid date format');
      }

      startOfRange.setHours(0, 0, 0, 0);
      endOfRange.setHours(23, 59, 59, 999);
      createdAt = { gte: startOfRange, lte: endOfRange };
    } else if (startDate) {
      const startOfRange = new Date(startDate);
      if (Number.isNaN(startOfRange.getTime())) {
        throw new Error('Invalid start date format');
      }
      startOfRange.setHours(0, 0, 0, 0);
      createdAt = { gte: startOfRange };
    } else if (endDate) {
      const endOfRange = new Date(endDate);
      if (Number.isNaN(endOfRange.getTime())) {
        throw new Error('Invalid end date format');
      }
      endOfRange.setHours(23, 59, 59, 999);
      createdAt = { gte: subMonths(new Date(), 12), lte: endOfRange };
    } else {
      createdAt = { gte: subMonths(new Date(), 2) };
    }
  } catch (error) {
    throw new Error(`Invalid date: ${error.message}`);
  }

  // Scope of the counts: the user's own sales in the date range
  const scope = { createdById: userId, createdAt };

  // The list: scope + every filter
  const filters = [scope];
  const statuses = toFilterList(status);
  if (statuses.length > 0) {
    filters.push({
      saleStatus: {
        in: statuses.filter((s) => SALE_STATUS_LABELS[s] !== undefined),
      },
    });
  }
  const customerSearch = (customerName || '').trim();
  if (customerSearch) {
    filters.push({ customer: { is: { name: { contains: customerSearch } } } });
  }
  const search = (q || '').trim();
  if (search) {
    const matchingStatuses = saleStatusesMatching(search);
    filters.push({
      OR: [
        { invoiceNo: { contains: search } },
        { customer: { is: { name: { contains: search } } } },
        ...(matchingStatuses.length > 0
          ? [{ saleStatus: { in: matchingStatuses } }]
          : []),
      ],
    });
  }
  const where = { AND: filters };

  const { take, currentPage, skip } = toPaging(page, limit);

  const [sells, count, totalCount, statusGroups] = await Promise.all([
    prisma.sell.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: SELL_LIST_INCLUDE,
    }),
    prisma.sell.count({ where }),
    prisma.sell.count({ where: scope }),
    prisma.sell.groupBy({
      by: ['saleStatus'],
      where: scope,
      _count: { _all: true },
    }),
  ]);

  return {
    sells,
    count, // sales matching every filter (for pagination)
    totalCount, // all of the user's sales in the date range
    statusCounts: toStatusCounts(statusGroups),
    page: currentPage,
    limit: take,
  };
};
// Get all Sells filtered by user's shops
const getAllSellsForStore = async ({
  startDate,
  endDate,
  userId,
  customerName,
  salesPersonName,
  status,
} = {}) => {
  // Validate required parameters
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Get user's shops (admins: all shops)
  const locations = await getAccessibleLocations(userId);

  if (!locations || locations.shopIds.length === 0) {
    return {
      sells: [],
      count: 0,
      totalCount: 0,
      isDefaultView: false,
    };
  }

  const userShopIds = locations.shopIds;

  // DETECT DEFAULT VIEW: Check if any filters are applied
  const hasNoStatusFilter =
    !status ||
    (typeof status === 'string' && status.trim() === '') ||
    status === 'all';
  const hasNoDateFilter = !startDate && !endDate;
  const hasNoCustomerFilter = !customerName || customerName.trim() === '';
  const hasNoSalesPersonFilter =
    !salesPersonName || salesPersonName.trim() === '';

  const isDefaultView =
    hasNoStatusFilter &&
    hasNoDateFilter &&
    hasNoCustomerFilter &&
    hasNoSalesPersonFilter;

  // For default view: Show all PARTIALLY_DELIVERED and APPROVED, plus last 10 DELIVERED
  // EXCLUDE: NOT_APPROVED and CANCELLED
  if (isDefaultView) {
    try {
      // Common where clause for shop filtering
      const shopFilter = {
        some: {
          shopId: {
            in: userShopIds,
          },
        },
      };

      // Get last 10 delivered sales
      const lastDeliveredQuery = {
        saleStatus: 'DELIVERED',
        items: shopFilter,
      };

      // Add date filtering for delivered sales (last 3 months for performance)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      lastDeliveredQuery.saleDate = { gte: threeMonthsAgo };

      const [lastDeliveredSells, partiallyDeliveredSells, approvedSells] =
        await Promise.all([
          // Get last 10 delivered sales
          prisma.sell.findMany({
            where: lastDeliveredQuery,
            orderBy: { saleDate: 'desc' },
            take: 10,
            include: {
              branch: true,
              customer: true,
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              items: {
                where: {
                  shopId: {
                    in: userShopIds,
                  },
                },
                include: {
                  product: {
                    include: {
                      unitOfMeasure: true,
                      category: true,
                    },
                  },
                  shop: true,
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
              SellStockCorrection: {
                select: {
                  id: true,
                  status: true,
                },
              },
              _count: {
                select: { items: true },
              },
            },
          }),

          // Get all PARTIALLY_DELIVERED sales
          prisma.sell.findMany({
            where: {
              saleStatus: 'PARTIALLY_DELIVERED',
              items: shopFilter,
            },
            orderBy: { saleDate: 'desc' },
            include: {
              branch: true,
              customer: true,
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              items: {
                where: {
                  shopId: {
                    in: userShopIds,
                  },
                },
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
                          product: true,
                        },
                      },
                    },
                  },
                },
              },
              SellStockCorrection: {
                select: {
                  id: true,
                  status: true,
                },
              },
              _count: {
                select: { items: true },
              },
            },
          }),

          // Get all APPROVED sales
          prisma.sell.findMany({
            where: {
              saleStatus: 'APPROVED',
              items: shopFilter,
            },
            orderBy: { saleDate: 'desc' },
            include: {
              branch: true,
              customer: true,
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              items: {
                where: {
                  shopId: {
                    in: userShopIds,
                  },
                },
                include: {
                  product: {
                    include: {
                      unitOfMeasure: true,
                      category: true,
                    },
                  },
                  shop: true,
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
              SellStockCorrection: {
                select: {
                  id: true,
                  status: true,
                },
              },
              _count: {
                select: { items: true },
              },
            },
          }),
        ]);

      // Combine all results - ONLY INCLUDING: PARTIALLY_DELIVERED, APPROVED, and last 10 DELIVERED
      const allSells = [
        ...partiallyDeliveredSells,
        ...approvedSells,
        ...lastDeliveredSells, // Last 10 delivered only
      ];

      // Sort by saleDate descending
      allSells.sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));

      // Get counts for each status with shop filtering
      const [
        partiallyDeliveredCount,
        approvedCount,
        deliveredCount,
        notApprovedCount,
        cancelledCount,
      ] = await Promise.all([
        prisma.sell.count({
          where: {
            saleStatus: 'PARTIALLY_DELIVERED',
            items: shopFilter,
          },
        }),
        prisma.sell.count({
          where: {
            saleStatus: 'APPROVED',
            items: shopFilter,
          },
        }),
        prisma.sell.count({
          where: {
            saleStatus: 'DELIVERED',
            items: shopFilter,
          },
        }),
        prisma.sell.count({
          where: {
            saleStatus: 'NOT_APPROVED',
            items: shopFilter,
          },
        }),
        prisma.sell.count({
          where: {
            saleStatus: 'CANCELLED',
            items: shopFilter,
          },
        }),
      ]);

      return {
        sells: allSells,
        count: allSells.length,
        totalCount: partiallyDeliveredCount + approvedCount + deliveredCount,
        isDefaultView: true,
        statusCounts: {
          PARTIALLY_DELIVERED: partiallyDeliveredCount,
          APPROVED: approvedCount,
          DELIVERED: deliveredCount,
          NOT_APPROVED: notApprovedCount,
          CANCELLED: cancelledCount,
        },
      };
    } catch (error) {
      console.error('Error in default view:', error);
      throw error;
    }
  }

  // REGULAR FILTERING LOGIC (when user applies any filter)
  const whereClause = {
    items: {
      some: {
        shopId: {
          in: userShopIds,
        },
      },
    },
  };

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Build the date filter
  if (startDateObj && endDateObj) {
    // Adjust for end date to include the entire day
    const adjustedEndDate = new Date(endDateObj);
    adjustedEndDate.setHours(23, 59, 59, 999);

    whereClause.saleDate = {
      gte: startDateObj,
      lte: adjustedEndDate,
    };
  } else if (startDateObj) {
    whereClause.saleDate = {
      gte: startDateObj,
      lte: new Date(),
    };
  } else if (endDateObj) {
    // Adjust for end date to include the entire day
    const adjustedEndDate = new Date(endDateObj);
    adjustedEndDate.setHours(23, 59, 59, 999);

    whereClause.saleDate = {
      gte: twelveMonthsAgo,
      lte: adjustedEndDate,
    };
  } else {
    whereClause.saleDate = {
      gte: twelveMonthsAgo,
    };
  }

  // Filter by status if provided
  if (status && status !== 'all') {
    if (Array.isArray(status) && status.length > 0) {
      whereClause.saleStatus = {
        in: status,
      };
    } else if (typeof status === 'string') {
      whereClause.saleStatus = status;
    }
  } else if (status === 'all') {
    // Show all statuses including NOT_APPROVED and CANCELLED when 'all' is specified
    // No saleStatus filter applied
  } else {
    // Default for filtered view: exclude NOT_APPROVED (like original)
    whereClause.saleStatus = { not: 'NOT_APPROVED' };
  }

  try {
    const sells = await prisma.sell.findMany({
      where: whereClause,
      orderBy: {
        saleDate: 'desc',
      },
      include: {
        branch: true,
        customer: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          where: {
            shopId: {
              in: userShopIds,
            },
          },
          include: {
            product: {
              include: {
                unitOfMeasure: true,
                category: true,
              },
            },
            shop: true,
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
        SellStockCorrection: {
          select: {
            id: true,
            status: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
    });

    // Apply case-insensitive filtering in memory if needed
    let filteredSells = sells;

    if (customerName && customerName.trim()) {
      const customerNameLower = customerName.trim().toLowerCase();
      filteredSells = filteredSells.filter(
        (sell) =>
          sell.customer &&
          sell.customer.name.toLowerCase().includes(customerNameLower),
      );
    }

    if (salesPersonName && salesPersonName.trim()) {
      const salesPersonNameLower = salesPersonName.trim().toLowerCase();
      filteredSells = filteredSells.filter(
        (sell) =>
          sell.createdBy &&
          sell.createdBy.name.toLowerCase().includes(salesPersonNameLower),
      );
    }

    return {
      sells: filteredSells,
      count: filteredSells.length,
      totalCount: await prisma.sell.count({ where: whereClause }),
      isDefaultView: false,
    };
  } catch (error) {
    console.error('Error fetching sells:', error);
    throw error;
  }
};

// Store Orders (/dashboard/StoreOrder): one page of the approved-or-later sales
// that have items in the logged-in user's shops. The counts cover every such
// sale in the date range. `status` takes sale statuses and/or stock-correction
// filters written as "stock-PENDING" (sales with a correction in that status).
const getAllSellsForStoreweb = async ({
  startDate,
  endDate,
  userId,
  customerName,
  salesPersonName,
  status,
  q,
  page = 1,
  limit = 10,
} = {}) => {
  const { take, currentPage, skip } = toPaging(page, limit);
  const emptyStockCounts = { PENDING: 0, PARTIAL: 0 };

  // Scope of the counts: not NOT_APPROVED, date range on saleDate, user's shops
  const scope = { saleStatus: { not: 'NOT_APPROVED' } };
  const twelveMonthsAgo = subMonths(new Date(), 12);
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  if (startDateObj && endDateObj) {
    // Adjust for end date to include the entire day
    const adjustedEndDate = new Date(endDateObj);
    adjustedEndDate.setHours(23, 59, 59, 999);
    scope.saleDate = { gte: startDateObj, lte: adjustedEndDate };
  } else if (startDateObj) {
    scope.saleDate = { gte: startDateObj, lte: new Date() };
  } else if (endDateObj) {
    const adjustedEndDate = new Date(endDateObj);
    adjustedEndDate.setHours(23, 59, 59, 999);
    scope.saleDate = { gte: twelveMonthsAgo, lte: adjustedEndDate };
  } else {
    scope.saleDate = { gte: twelveMonthsAgo };
  }

  if (userId) {
    const locations = await getAccessibleLocations(userId);

    if (!locations || locations.shopIds.length === 0) {
      return {
        sells: [],
        count: 0,
        totalCount: 0,
        statusCounts: toStatusCounts([]),
        stockCorrectionCounts: emptyStockCounts,
        page: currentPage,
        limit: take,
      };
    }

    const userShopIds = locations.shopIds;
    scope.items = { some: { shopId: { in: userShopIds } } };
  }

  // The list: scope + every filter
  const filters = [scope];
  const statusValues = toFilterList(status);
  const stockStatuses = statusValues
    .filter((s) => s.startsWith('stock-'))
    .map((s) => s.replace('stock-', '').toUpperCase());
  const saleStatuses = statusValues.filter((s) => !s.startsWith('stock-'));
  if (saleStatuses.length > 0) {
    filters.push({
      saleStatus: {
        in: saleStatuses.filter((s) => SALE_STATUS_LABELS[s] !== undefined),
      },
    });
  }
  if (stockStatuses.length > 0) {
    filters.push({
      SellStockCorrection: {
        some: {
          status: {
            in: stockStatuses.filter((s) =>
              SELL_STOCK_CORRECTION_STATUSES.includes(s),
            ),
          },
        },
      },
    });
  }
  const customerSearch = (customerName || '').trim();
  if (customerSearch) {
    filters.push({ customer: { is: { name: { contains: customerSearch } } } });
  }
  const salesPersonSearch = (salesPersonName || '').trim();
  if (salesPersonSearch) {
    filters.push({
      createdBy: { is: { name: { contains: salesPersonSearch } } },
    });
  }
  const search = (q || '').trim();
  if (search) {
    const matchingStatuses = saleStatusesMatching(search);
    const matchingCorrectionStatuses = SELL_STOCK_CORRECTION_STATUSES.filter(
      (s) => s.toLowerCase().includes(search.toLowerCase()),
    );
    filters.push({
      OR: [
        { invoiceNo: { contains: search } },
        { customer: { is: { name: { contains: search } } } },
        ...(matchingStatuses.length > 0
          ? [{ saleStatus: { in: matchingStatuses } }]
          : []),
        ...(matchingCorrectionStatuses.length > 0
          ? [
              {
                SellStockCorrection: {
                  some: { status: { in: matchingCorrectionStatuses } },
                },
              },
            ]
          : []),
      ],
    });
  }
  const where = { AND: filters };

  const withCorrection = (correctionStatus) => ({
    AND: [
      scope,
      { SellStockCorrection: { some: { status: correctionStatus } } },
    ],
  });

  const [sells, count, totalCount, statusGroups, stockPending, stockPartial] =
    await Promise.all([
      prisma.sell.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: SELL_LIST_INCLUDE,
      }),
      prisma.sell.count({ where }),
      prisma.sell.count({ where: scope }),
      prisma.sell.groupBy({
        by: ['saleStatus'],
        where: scope,
        _count: { _all: true },
      }),
      prisma.sell.count({ where: withCorrection('PENDING') }),
      prisma.sell.count({ where: withCorrection('PARTIAL') }),
    ]);

  return {
    sells,
    count, // sales matching every filter (for pagination)
    totalCount, // all sales in scope (user's shops, date range)
    statusCounts: toStatusCounts(statusGroups),
    // sales in scope with at least one stock correction in that status
    stockCorrectionCounts: { PENDING: stockPending, PARTIAL: stockPartial },
    page: currentPage,
    limit: take,
  };
};

const unlockSell = async (id) => {
  const currentSell = await prisma.sell.findUnique({
    where: { id },
  });

  if (!currentSell) {
    throw new Error(`Sell with id ${id} not found`);
  }

  const newLockedState = !currentSell.locked;

  // Always set lockedAt to current time when changing state
  const sell = await prisma.sell.update({
    where: { id },
    data: {
      locked: newLockedState,
      lockedAt: new Date(), // Always set to current time
    },
  });

  return sell;
};
module.exports = {
  // Also used for online orders from e-commerce
  generateInvoiceNumber,
  unlockSell,
  getSellById,
  getSellByInvoiceNo,
  getAllSells,
  createSell,
  updateSell,
  deleteSell,
  deliverAllSaleItems,
  completeSaleDelivery,
  updateSaleStatus,
  cancelSale,
  partialSaleDelivery,
  getAllSellsuser,
  getAllSellsuserweb,
  getAllSellsForStore,
  getAllSellsForStoreweb,
  getSellByIdByuser,
};
