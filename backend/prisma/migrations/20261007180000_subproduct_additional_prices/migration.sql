-- Sub-products can have their own additional prices: a label is unique per
-- product / sub-product / shop instead of per product.
-- The new index starts with productId, so it keeps backing the productId
-- foreign key and the old index can be dropped after it exists.

-- CreateIndex
CREATE UNIQUE INDEX `additional_prices_productId_subProductId_shopId_label_key` ON `additional_prices`(`productId`, `subProductId`, `shopId`, `label`);

-- DropIndex
DROP INDEX `additional_prices_productId_label_key` ON `additional_prices`;
