// Sample stock for the products from seed-sample-products.js: one batch per
// sub-product (or one per product when it has none). Each batch gets opening
// stock in a store, and part of it is moved on to a shop. Store/shop stock and
// the stock ledger are written together, the same way the app books opening
// stock and transfers.
// Safe to re-run: batches are matched by batch number and skipped if present.
//
//   node prisma/seed-sample-stock.js
const prisma = require('../src/services/prisma');
const { runStockTransaction } = require('../src/utils/stockTransaction');

const PRODUCT_CODES = Array.from({ length: 10 }, (_, i) => `PRS${String(i + 1).padStart(3, '0')}`);

const monthsFromNow = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
};

const main = async () => {
  const stores = await prisma.store.findMany({ orderBy: { name: 'asc' } });
  const shops = await prisma.shop.findMany({ orderBy: { name: 'asc' } });
  if (!stores.length || !shops.length) throw new Error('Create at least one store and one shop first');
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });

  const products = await prisma.product.findMany({
    where: { productCode: { in: PRODUCT_CODES } },
    include: { subProducts: { orderBy: { subProductCode: 'asc' } } },
    orderBy: { productCode: 'asc' },
  });
  if (!products.length) throw new Error('Run prisma/seed-sample-products.js first');

  let n = 0;
  for (const product of products) {
    const targets = product.subProducts.length ? product.subProducts : [null];
    for (const [i, sub] of targets.entries()) {
      const batchNumber = `BATCH-${product.productCode}-${String(i + 1).padStart(2, '0')}`;
      if (await prisma.productBatch.findUnique({ where: { batchNumber } })) {
        console.log(`= ${batchNumber} already exists, skipped`);
        continue;
      }
      const store = stores[n % stores.length];
      const shop = shops[n % shops.length];
      const opening = 40 + ((n * 17) % 61); // 40–100
      const toShop = Math.round(opening * 0.3); // 30% moved to the shop
      const sellPrice = Number(sub?.sellPrice ?? product.sellPrice ?? 0);
      const cost = Math.round(sellPrice * 0.7); // batch (purchase) price
      // A couple of batches expire soon so the expiry warnings have data
      const expiryDate = n % 6 === 5 ? monthsFromNow(2) : monthsFromNow(12 + (n % 4) * 6);
      const label = sub ? `${product.name} - ${sub.name}` : product.name;
      n += 1;

      // eslint-disable-next-line no-await-in-loop
      await runStockTransaction(async (tx) => {
        const batch = await tx.productBatch.create({
          data: {
            batchNumber,
            expiryDate,
            price: cost,
            productId: product.id,
            subProductId: sub?.id ?? null,
            storeId: store.id,
          },
        });
        const common = {
          batchId: batch.id,
          unitOfMeasureId: product.unitOfMeasureId,
          sourceType: 'OPENING_STOCK',
          sourceId: batch.id,
          userId: user?.id ?? null,
          movementDate: new Date(),
        };

        await tx.storeStock.create({
          data: {
            storeId: store.id,
            batchId: batch.id,
            quantity: opening - toShop,
            status: 'Available',
            unitOfMeasureId: product.unitOfMeasureId,
          },
        });
        await tx.shopStock.create({
          data: {
            shopId: shop.id,
            batchId: batch.id,
            quantity: toShop,
            status: 'Available',
            unitOfMeasureId: product.unitOfMeasureId,
          },
        });

        await tx.stockLedger.create({
          data: {
            ...common,
            storeId: store.id,
            movementType: 'IN',
            quantity: opening,
            reference: `BATCH-${batchNumber}`,
            notes: `Initial stock creation for batch ${batchNumber}${sub ? ` - Subproduct: ${sub.name}` : ''}`,
          },
        });
        await tx.stockLedger.create({
          data: {
            ...common,
            storeId: store.id,
            movementType: 'OUT',
            quantity: toShop,
            reference: `BATCH-${batchNumber}`,
            notes: `Opening stock moved to ${shop.name}`,
          },
        });
        await tx.stockLedger.create({
          data: {
            ...common,
            shopId: shop.id,
            movementType: 'IN',
            quantity: toShop,
            reference: `BATCH-${batchNumber}`,
            notes: `Opening stock moved from ${store.name}`,
          },
        });
      });

      console.log(
        `+ ${batchNumber} ${label}: ${opening - toShop} in ${store.name}, ${toShop} in ${shop.name}, expires ${expiryDate.toISOString().slice(0, 10)}`,
      );
    }
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
