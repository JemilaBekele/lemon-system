const express = require('express');
const integrationAuth = require('../middlewares/integrationAuth');
const prisma = require('../services/prisma');
const catchAsync = require('../utils/catchAsync');
const {
  createSaleFromEcommerceOrder,
  cancelEcommerceOrderSale,
} = require('../services/ecommerceOrder.service');

const router = express.Router();

// Endpoints for the e-commerce system. They use the shared integration key
// (see middlewares/integrationAuth.js), not a user login.

// Stock shops, so e-commerce staff can link each warehouse to one
router.get(
  '/api/integration/shops',
  integrationAuth,
  catchAsync(async (req, res) => {
    const shops = await prisma.shop.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        branch: { select: { id: true, name: true } },
      },
    });
    res.send({ success: true, data: { shops } });
  }),
);

// Image paths are stored like "uploads\\product_images\\image-1.webp" on
// Windows; send them with forward slashes so e-commerce can download them
// from <stock host>/<path>. Full URLs (e.g. S3) are sent as they are.
const imagePath = (value) =>
  value ? String(value).replace(/\\/g, '/').replace(/^\/+/, '') : null;

// The whole catalogue for the e-commerce product sync: units, categories,
// sub-categories and products with their sub-products. The e-commerce price
// is the price the online shop uses (null = not set yet).
router.get(
  '/api/integration/catalog',
  integrationAuth,
  catchAsync(async (req, res) => {
    const [units, categories, subCategories, products] = await Promise.all([
      prisma.unitOfMeasure.findMany({
        select: { id: true, name: true, symbol: true },
      }),
      prisma.category.findMany({
        select: { id: true, name: true, image: true, isActive: true },
      }),
      prisma.subCategory.findMany({
        select: {
          id: true,
          name: true,
          image: true,
          isActive: true,
          categoryId: true,
        },
      }),
      prisma.product.findMany({
        orderBy: { productCode: 'asc' },
        select: {
          id: true,
          productCode: true,
          name: true,
          generic: true,
          description: true,
          imageUrl: true,
          isActive: true,
          categoryId: true,
          subCategoryId: true,
          unitOfMeasureId: true,
          ecommercePrice: true,
          subProducts: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              name: true,
              subProductCode: true,
              imageUrl: true,
              isActive: true,
              ecommercePrice: true,
            },
          },
        },
      }),
    ]);

    const price = (value) =>
      value === null || value === undefined ? null : Number(value);

    res.send({
      success: true,
      data: {
        units,
        categories: categories.map((c) => ({
          ...c,
          image: imagePath(c.image),
        })),
        subCategories: subCategories.map((s) => ({
          ...s,
          image: imagePath(s.image),
        })),
        products: products.map((p) => ({
          ...p,
          imageUrl: imagePath(p.imageUrl),
          ecommercePrice: price(p.ecommercePrice),
          subProducts: p.subProducts.map((sp) => ({
            ...sp,
            imageUrl: imagePath(sp.imageUrl),
            ecommercePrice: price(sp.ecommercePrice),
          })),
        })),
      },
    });
  }),
);

// Stock on hand for the online shop: every product and variant with its total
// quantity across ALL shops and ALL stores (Available stock only). The shop
// says "out of stock" only when nothing is left anywhere.
router.get(
  '/api/integration/availability',
  integrationAuth,
  catchAsync(async (req, res) => {
    const where = { status: 'Available', quantity: { gt: 0 } };
    const select = {
      quantity: true,
      batch: { select: { productId: true, subProductId: true } },
    };
    const [storeStocks, shopStocks] = await Promise.all([
      prisma.storeStock.findMany({ where, select }),
      prisma.shopStock.findMany({ where, select }),
    ]);

    const products = new Map();
    [...storeStocks, ...shopStocks].forEach((row) => {
      const { productId, subProductId } = row.batch;
      const product = products.get(productId) || {
        id: productId,
        quantity: 0,
        subProducts: new Map(),
      };
      product.quantity += row.quantity;
      if (subProductId) {
        product.subProducts.set(
          subProductId,
          (product.subProducts.get(subProductId) || 0) + row.quantity,
        );
      }
      products.set(productId, product);
    });

    res.send({
      success: true,
      data: {
        products: [...products.values()].map((p) => ({
          id: p.id,
          quantity: p.quantity,
          subProducts: [...p.subProducts].map(([id, quantity]) => ({
            id,
            quantity,
          })),
        })),
      },
    });
  }),
);

// A confirmed e-commerce order becomes an approved sale here (see
// services/ecommerceOrder.service.js). Sending the same order again returns
// the same sale.
router.post(
  '/api/integration/ecommerce-orders',
  integrationAuth,
  catchAsync(async (req, res) => {
    const sale = await createSaleFromEcommerceOrder(req.body);
    res
      .status(sale.alreadyExisted ? 200 : 201)
      .send({ success: true, data: sale });
  }),
);

// The order was cancelled in e-commerce: cancel its sale (refused once
// delivery has started)
router.post(
  '/api/integration/ecommerce-orders/:orderId/cancel',
  integrationAuth,
  catchAsync(async (req, res) => {
    const result = await cancelEcommerceOrderSale(req.params.orderId);
    res.send({ success: true, data: result });
  }),
);

module.exports = router;
