-- The e-commerce price is kept on products and sub-products only, not on
-- batches.

-- AlterTable
ALTER TABLE `product_batches` DROP COLUMN `ecommerce_price`;

