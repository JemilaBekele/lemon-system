-- E-commerce price entered when stock (a batch) is added. Optional.

-- AlterTable
ALTER TABLE `product_batches` ADD COLUMN `ecommerce_price` DECIMAL(14, 2) NULL;

