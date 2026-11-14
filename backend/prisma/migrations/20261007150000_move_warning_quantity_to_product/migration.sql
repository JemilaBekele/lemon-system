-- Move the low-stock threshold from product batches to products.

-- AlterTable
ALTER TABLE `products` ADD COLUMN `warningQuantity` INTEGER NOT NULL DEFAULT 0;

-- Keep existing settings: each product takes the highest value set on its batches.
UPDATE `products` p
INNER JOIN (
    SELECT `productId`, MAX(COALESCE(`warningQuantity`, 0)) AS `maxWarning`
    FROM `product_batches`
    GROUP BY `productId`
) b ON b.`productId` = p.`_id`
SET p.`warningQuantity` = b.`maxWarning`;

-- AlterTable
ALTER TABLE `product_batches` DROP COLUMN `warningQuantity`;
