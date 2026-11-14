-- E-commerce price on products and sub-products, entered in stock and used
-- by the online shop. Optional: existing rows stay empty until staff set it.

-- AlterTable
ALTER TABLE `products` ADD COLUMN `ecommerce_price` DECIMAL(14, 2) NULL;

-- AlterTable
ALTER TABLE `sub_products` ADD COLUMN `ecommerce_price` DECIMAL(14, 2) NULL;

