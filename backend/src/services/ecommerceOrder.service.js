const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');
const { getIO } = require('../socket/s');
const {
  getShopNotificationRecipients,
} = require('../utils/accessibleLocations');
const { generateInvoiceNumber, cancelSale } = require('./Sell.service');

// Online orders from the e-commerce system. When staff confirm an order
// there, it is sent here and becomes a normal sale:
// - source ECOMMERCE, with the order id (unique, so the same order can never
//   become two sales) and order number;
// - status APPROVED, at the prices the customer paid online;
// - each line in the stock shop of its warehouse (chosen in e-commerce);
// - the delivery fee in the notes (the sale total is the goods only).
// Store staff then pick batches and deliver as usual; stock goes down then.

const money = (value) => Math.round(Number(value) * 100) / 100;

const fail = (message) => new ApiError(httpStatus.BAD_REQUEST, message);

const validateOrder = (body) => {
  const order = body || {};
  if (!order.orderId || !order.orderNumber) {
    throw fail('orderId and orderNumber are required');
  }
  if (!order.customer || !order.customer.name) {
    throw fail('customer with a name is required');
  }
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw fail('The order has no items');
  }
  order.items.forEach((item, index) => {
    const line = `Line ${index + 1}`;
    if (!item.stockProductId) throw fail(`${line}: stockProductId is required`);
    if (!item.stockShopId) throw fail(`${line}: stockShopId is required`);
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw fail(`${line}: quantity must be a whole number above 0`);
    }
    if (
      !Number.isFinite(Number(item.unitPrice)) ||
      Number(item.unitPrice) < 0
    ) {
      throw fail(`${line}: unitPrice must be 0 or more`);
    }
  });
  return order;
};

// Find the stock customer for an e-commerce customer: by its e-commerce id,
// then by phone (and remember the link), else create one
const resolveCustomer = async (tx, customer) => {
  if (customer.id) {
    const linked = await tx.customer.findUnique({
      where: { externalCustomerId: customer.id },
    });
    if (linked) return linked;
  }
  if (customer.phone) {
    const byPhone = await tx.customer.findFirst({
      where: { phone1: customer.phone },
    });
    if (byPhone) {
      if (!byPhone.externalCustomerId && customer.id) {
        return tx.customer.update({
          where: { id: byPhone.id },
          data: { externalCustomerId: customer.id },
        });
      }
      return byPhone;
    }
  }
  return tx.customer.create({
    data: {
      name: customer.name,
      phone1: customer.phone || '',
      companyName: customer.companyName || null,
      tinNumber: customer.tinNumber || null,
      externalCustomerId: customer.id || null,
    },
  });
};

const notifyShops = async (sell) => {
  try {
    const shopIds = [...new Set(sell.items.map((item) => item.shopId))];
    await Promise.allSettled(
      shopIds.map((shopId) =>
        prisma.notification.create({
          data: {
            shopId,
            title: 'Online Order - Prepare for Delivery',
            message: `Online order ${sell.externalOrderNumber} (sale #${sell.invoiceNo}) is approved and ready for delivery preparation`,
            type: 'SELL_READY_FOR_DELIVERY',
            relatedEntityType: 'SELL',
          },
        }),
      ),
    );
    const recipients = await getShopNotificationRecipients(shopIds);
    const io = getIO();
    const payload = {
      title: 'New Online Order',
      message: `Online order ${sell.externalOrderNumber} (sale #${sell.invoiceNo}) needs delivery preparation`,
      type: 'SELL_READY_FOR_DELIVERY',
      relatedEntityType: 'SELL',
      saleId: sell.id,
      invoiceNo: sell.invoiceNo,
      timestamp: new Date().toISOString(),
    };
    recipients.forEach((user) => {
      io.to(user.id).emit('new-notification', payload);
      user.shops.forEach((shop) => {
        io.to(`${user.id}:${shop.id}`).emit('new-notification', payload);
      });
    });
  } catch (error) {
    // A notification problem must not undo the sale
  }
};

const saleView = (sell, alreadyExisted) => ({
  sellId: sell.id,
  invoiceNo: sell.invoiceNo,
  saleStatus: sell.saleStatus,
  alreadyExisted,
});

const createSaleFromEcommerceOrder = async (body) => {
  const order = validateOrder(body);

  // Sent before (e.g. a retry): return the same sale
  const existing = await prisma.sell.findUnique({
    where: { externalOrderId: order.orderId },
  });
  if (existing) return saleView(existing, true);

  // Check every product, variant and shop before writing anything
  const productIds = [...new Set(order.items.map((i) => i.stockProductId))];
  const shopIds = [...new Set(order.items.map((i) => i.stockShopId))];
  const [products, shops] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        unitOfMeasureId: true,
        subProducts: { select: { id: true } },
      },
    }),
    prisma.shop.findMany({
      where: { id: { in: shopIds } },
      select: { id: true, branchId: true },
    }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const shopById = new Map(shops.map((s) => [s.id, s]));
  order.items.forEach((item, index) => {
    const product = productById.get(item.stockProductId);
    if (!product) throw fail(`Line ${index + 1}: product not found in stock`);
    if (
      item.stockSubProductId &&
      !product.subProducts.some((sp) => sp.id === item.stockSubProductId)
    ) {
      throw fail(`Line ${index + 1}: variant not found for ${product.name}`);
    }
    if (!shopById.has(item.stockShopId)) {
      throw fail(`Line ${index + 1}: shop not found in stock`);
    }
  });

  const lines = order.items.map((item) => ({
    productId: item.stockProductId,
    subProductId: item.stockSubProductId || null,
    shopId: item.stockShopId,
    unitOfMeasureId: productById.get(item.stockProductId).unitOfMeasureId,
    quantity: item.quantity,
    unitPrice: money(item.unitPrice),
    totalPrice: money(Number(item.unitPrice) * item.quantity),
    itemSaleStatus: 'PENDING',
  }));
  const subTotal = money(lines.reduce((sum, l) => sum + l.totalPrice, 0));
  const deliveryFee = money(order.deliveryFee || 0);
  const notes = [
    `Online order ${order.orderNumber}.`,
    deliveryFee > 0
      ? `Delivery fee: ${deliveryFee.toLocaleString(
          'en-US',
        )} birr (not included in this sale).`
      : 'No delivery fee.',
    order.notes ? `Customer note: ${order.notes}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  // invoiceNo is handed out as max+1, so a concurrent sale may take the same
  // number first: retry with a new number on that conflict only
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const invoiceNo = await generateInvoiceNumber();
    try {
      // eslint-disable-next-line no-await-in-loop
      const sell = await prisma.$transaction(async (tx) => {
        const customer = await resolveCustomer(tx, order.customer);
        const created = await tx.sell.create({
          data: {
            invoiceNo,
            source: 'ECOMMERCE',
            externalOrderId: order.orderId,
            externalOrderNumber: order.orderNumber,
            saleStatus: 'APPROVED',
            customerId: customer.id,
            branchId: shopById.get(lines[0].shopId).branchId,
            totalProducts: lines.length,
            subTotal,
            discount: 0,
            vat: 0,
            grandTotal: subTotal,
            NetTotal: subTotal,
            notes,
            saleDate: new Date(),
            items: { create: lines },
          },
          include: { items: true },
        });
        // Keep the message as received, for reference
        await tx.onlineOrder.create({
          data: {
            externalOrderId: order.orderId,
            externalOrderNumber: order.orderNumber,
            status: 'CONVERTED',
            customerId: customer.id,
            customerName: order.customer.name,
            customerPhone: order.customer.phone || null,
            companyName: order.customer.companyName || null,
            tinNumber: order.customer.tinNumber || null,
            subtotal: money(order.subtotal ?? subTotal),
            discountTotal: money(order.discountTotal || 0),
            deliveryFee,
            totalAmount: money(order.totalAmount ?? subTotal + deliveryFee),
            notes: order.notes || null,
            payload: order,
            sellId: created.id,
            convertedAt: new Date(),
            items: {
              create: lines.map((line, index) => ({
                lineNo: index,
                productId: line.productId,
                subProductId: line.subProductId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                totalPrice: line.totalPrice,
                shopId: line.shopId,
              })),
            },
          },
        });
        return created;
      });
      // eslint-disable-next-line no-await-in-loop
      await notifyShops(sell);
      return saleView(sell, false);
    } catch (error) {
      const target = String((error.meta && error.meta.target) || '');
      if (error.code === 'P2002' && target.includes('external_order_id')) {
        // The same order arrived twice at once: return the sale that won
        // eslint-disable-next-line no-await-in-loop
        const winner = await prisma.sell.findUnique({
          where: { externalOrderId: order.orderId },
        });
        if (winner) return saleView(winner, true);
      }
      if (!(error.code === 'P2002' && target.includes('invoiceNo'))) {
        throw error;
      }
    }
  }
  throw new ApiError(
    httpStatus.CONFLICT,
    'Could not get a free invoice number, try again',
  );
};

// The order was cancelled in e-commerce: cancel its sale unless delivery has
// started (then stock refuses, and so does the cancellation in e-commerce)
const cancelEcommerceOrderSale = async (orderId) => {
  const sell = await prisma.sell.findUnique({
    where: { externalOrderId: orderId },
  });
  if (!sell) return { cancelled: false, reason: 'No sale for this order' };
  if (sell.saleStatus === 'CANCELLED') {
    return { cancelled: true, invoiceNo: sell.invoiceNo };
  }
  await cancelSale(sell.id, null);
  await prisma.onlineOrder.updateMany({
    where: { externalOrderId: orderId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  return { cancelled: true, invoiceNo: sell.invoiceNo };
};

module.exports = { createSaleFromEcommerceOrder, cancelEcommerceOrderSale };
