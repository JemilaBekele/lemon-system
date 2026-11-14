-- Stock integrity: history relations RESTRICT, ledger source link, enum values
-- matching the code, ProductBatch.stock dropped (stock lives in store/shop
-- stock only), required batch on stock correction items, query indexes,
-- and quantities can never go below zero.

-- DropForeignKey
ALTER TABLE `product_batches` DROP FOREIGN KEY `product_batches_subProductId_fkey`;

-- DropForeignKey
ALTER TABLE `purchase_items` DROP FOREIGN KEY `purchase_items_subProductId_fkey`;

-- DropForeignKey
ALTER TABLE `sell_items` DROP FOREIGN KEY `sell_items_subProductId_fkey`;

-- DropForeignKey
ALTER TABLE `sell_stock_correction_items` DROP FOREIGN KEY `sell_stock_correction_items_shopId_fkey`;

-- DropForeignKey
ALTER TABLE `sell_stock_correction_items` DROP FOREIGN KEY `sell_stock_correction_items_subProductId_fkey`;

-- DropForeignKey
ALTER TABLE `stock_correction_items` DROP FOREIGN KEY `stock_correction_items_batchId_fkey`;

-- DropForeignKey
ALTER TABLE `stock_correction_items` DROP FOREIGN KEY `stock_correction_items_subProductId_fkey`;

-- DropForeignKey
ALTER TABLE `stock_corrections` DROP FOREIGN KEY `stock_corrections_shopId_fkey`;

-- DropForeignKey
ALTER TABLE `stock_corrections` DROP FOREIGN KEY `stock_corrections_storeId_fkey`;

-- DropForeignKey
ALTER TABLE `stock_ledgers` DROP FOREIGN KEY `stock_ledgers_shopId_fkey`;

-- DropForeignKey
ALTER TABLE `stock_ledgers` DROP FOREIGN KEY `stock_ledgers_storeId_fkey`;

-- DropForeignKey
ALTER TABLE `sub_products` DROP FOREIGN KEY `sub_products_productId_fkey`;

-- DropForeignKey
ALTER TABLE `transfer_items` DROP FOREIGN KEY `transfer_items_subProductId_fkey`;

-- DropForeignKey
ALTER TABLE `transfers` DROP FOREIGN KEY `transfers_destShopId_fkey`;

-- DropForeignKey
ALTER TABLE `transfers` DROP FOREIGN KEY `transfers_destStoreId_fkey`;

-- DropForeignKey
ALTER TABLE `transfers` DROP FOREIGN KEY `transfers_sourceShopId_fkey`;

-- DropForeignKey
ALTER TABLE `transfers` DROP FOREIGN KEY `transfers_sourceStoreId_fkey`;

-- DropIndex
DROP INDEX `product_batches_subProductId_fkey` ON `product_batches`;

-- DropIndex
DROP INDEX `purchase_items_subProductId_fkey` ON `purchase_items`;

-- DropIndex
DROP INDEX `sell_items_subProductId_fkey` ON `sell_items`;

-- DropIndex
DROP INDEX `sell_stock_correction_items_shopId_fkey` ON `sell_stock_correction_items`;

-- DropIndex
DROP INDEX `sell_stock_correction_items_subProductId_fkey` ON `sell_stock_correction_items`;

-- DropIndex
DROP INDEX `stock_correction_items_batchId_fkey` ON `stock_correction_items`;

-- DropIndex
DROP INDEX `stock_correction_items_subProductId_fkey` ON `stock_correction_items`;

-- DropIndex
DROP INDEX `stock_corrections_shopId_fkey` ON `stock_corrections`;

-- DropIndex
DROP INDEX `stock_corrections_storeId_fkey` ON `stock_corrections`;

-- DropIndex
DROP INDEX `stock_ledgers_shopId_fkey` ON `stock_ledgers`;

-- DropIndex
DROP INDEX `stock_ledgers_storeId_fkey` ON `stock_ledgers`;

-- DropIndex
DROP INDEX `sub_products_productId_fkey` ON `sub_products`;

-- DropIndex
DROP INDEX `transfer_items_subProductId_fkey` ON `transfer_items`;

-- DropIndex
DROP INDEX `transfers_destShopId_fkey` ON `transfers`;

-- DropIndex
DROP INDEX `transfers_destStoreId_fkey` ON `transfers`;

-- DropIndex
DROP INDEX `transfers_sourceShopId_fkey` ON `transfers`;

-- DropIndex
DROP INDEX `transfers_sourceStoreId_fkey` ON `transfers`;

-- AlterTable
ALTER TABLE `product_batches` DROP COLUMN `stock`;

-- AlterTable
ALTER TABLE `sell_items` MODIFY `itemSaleStatus` ENUM('PENDING', 'DELIVERED', 'REJECTED', 'CANCELLED', 'RETURNED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `sell_stock_correction_items` MODIFY `itemSaleStatus` ENUM('PENDING', 'DELIVERED', 'REJECTED', 'CANCELLED', 'RETURNED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `sells` MODIFY `saleStatus` ENUM('NOT_APPROVED', 'PARTIALLY_DELIVERED', 'APPROVED', 'DELIVERED', 'CANCELLED', 'RETURNED') NOT NULL DEFAULT 'NOT_APPROVED';

-- AlterTable
ALTER TABLE `stock_correction_items` MODIFY `batchId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `stock_ledgers` ADD COLUMN `sourceId` CHAR(36) NULL,
    ADD COLUMN `sourceType` ENUM('PURCHASE', 'TRANSFER', 'SALE', 'STOCK_CORRECTION', 'SELL_CORRECTION', 'OPENING_STOCK') NULL;

-- CreateIndex
CREATE INDEX `product_batches_productId_expiryDate_idx` ON `product_batches`(`productId`, `expiryDate`);

-- CreateIndex
CREATE INDEX `purchases_purchaseDate_idx` ON `purchases`(`purchaseDate`);

-- CreateIndex
CREATE INDEX `sell_stock_corrections_status_created_at_idx` ON `sell_stock_corrections`(`status`, `created_at`);

-- CreateIndex
CREATE INDEX `sells_saleStatus_saleDate_idx` ON `sells`(`saleStatus`, `saleDate`);

-- CreateIndex
CREATE INDEX `sells_createdById_saleDate_idx` ON `sells`(`createdById`, `saleDate`);

-- CreateIndex
CREATE INDEX `stock_corrections_status_created_at_idx` ON `stock_corrections`(`status`, `created_at`);

-- CreateIndex
CREATE INDEX `stock_ledgers_sourceType_sourceId_idx` ON `stock_ledgers`(`sourceType`, `sourceId`);

-- CreateIndex
CREATE INDEX `stock_ledgers_batchId_movementDate_idx` ON `stock_ledgers`(`batchId`, `movementDate`);

-- CreateIndex
CREATE INDEX `stock_ledgers_storeId_movementDate_idx` ON `stock_ledgers`(`storeId`, `movementDate`);

-- CreateIndex
CREATE INDEX `stock_ledgers_shopId_movementDate_idx` ON `stock_ledgers`(`shopId`, `movementDate`);

-- CreateIndex
CREATE INDEX `transfers_status_created_at_idx` ON `transfers`(`status`, `created_at`);

-- AddForeignKey
ALTER TABLE `stock_ledgers` ADD CONSTRAINT `stock_ledgers_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_ledgers` ADD CONSTRAINT `stock_ledgers_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sub_products` ADD CONSTRAINT `sub_products_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_batches` ADD CONSTRAINT `product_batches_subProductId_fkey` FOREIGN KEY (`subProductId`) REFERENCES `sub_products`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_subProductId_fkey` FOREIGN KEY (`subProductId`) REFERENCES `sub_products`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_sourceStoreId_fkey` FOREIGN KEY (`sourceStoreId`) REFERENCES `stores`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_sourceShopId_fkey` FOREIGN KEY (`sourceShopId`) REFERENCES `shops`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_destStoreId_fkey` FOREIGN KEY (`destStoreId`) REFERENCES `stores`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_destShopId_fkey` FOREIGN KEY (`destShopId`) REFERENCES `shops`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transfer_items` ADD CONSTRAINT `transfer_items_subProductId_fkey` FOREIGN KEY (`subProductId`) REFERENCES `sub_products`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_corrections` ADD CONSTRAINT `stock_corrections_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_corrections` ADD CONSTRAINT `stock_corrections_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_correction_items` ADD CONSTRAINT `stock_correction_items_subProductId_fkey` FOREIGN KEY (`subProductId`) REFERENCES `sub_products`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_correction_items` ADD CONSTRAINT `stock_correction_items_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `product_batches`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sell_items` ADD CONSTRAINT `sell_items_subProductId_fkey` FOREIGN KEY (`subProductId`) REFERENCES `sub_products`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sell_stock_correction_items` ADD CONSTRAINT `sell_stock_correction_items_subProductId_fkey` FOREIGN KEY (`subProductId`) REFERENCES `sub_products`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sell_stock_correction_items` ADD CONSTRAINT `sell_stock_correction_items_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shops`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Stock quantities can never be negative (Prisma cannot express CHECK constraints)
ALTER TABLE `store_stocks` ADD CONSTRAINT `store_stocks_quantity_non_negative` CHECK (`quantity` >= 0);
ALTER TABLE `shop_stocks` ADD CONSTRAINT `shop_stocks_quantity_non_negative` CHECK (`quantity` >= 0);
