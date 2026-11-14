-- Keep purchase lines in the order they were entered. Existing lines get 0
-- and are listed in creation order.

-- AlterTable
ALTER TABLE `purchase_items` ADD COLUMN `lineNo` INTEGER NOT NULL DEFAULT 0;
