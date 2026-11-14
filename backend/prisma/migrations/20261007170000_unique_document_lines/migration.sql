-- A purchase, transfer or stock correction lists each batch (and so each
-- product / sub-product / batch) only once.

-- CreateIndex
CREATE UNIQUE INDEX `purchase_items_purchaseId_batchId_key` ON `purchase_items`(`purchaseId`, `batchId`);

-- CreateIndex
CREATE UNIQUE INDEX `stock_correction_items_correctionId_batchId_key` ON `stock_correction_items`(`correctionId`, `batchId`);

-- CreateIndex
CREATE UNIQUE INDEX `transfer_items_transferId_batchId_key` ON `transfer_items`(`transferId`, `batchId`);

