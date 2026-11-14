-- Money columns: DOUBLE -> DECIMAL(14, 2) (exact storage). Existing values are
-- rounded to 2 decimals. NULL / DEFAULT are unchanged.

-- AlterTable
ALTER TABLE `products` MODIFY `sellPrice` DECIMAL(14, 2) NULL;

-- AlterTable
ALTER TABLE `sub_products` MODIFY `sellPrice` DECIMAL(14, 2) NULL;

-- AlterTable
ALTER TABLE `additional_prices` MODIFY `price` DECIMAL(14, 2) NOT NULL;

-- AlterTable
ALTER TABLE `product_batches` MODIFY `price` DECIMAL(14, 2) NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `purchase_items` MODIFY `unitPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `totalPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `sells` MODIFY `subTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `discount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `vat` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `grandTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `NetTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `sell_items` MODIFY `unitPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `totalPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `add_to_carts` MODIFY `discount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `totalAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `cart_items` MODIFY `unitPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `totalPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `sell_stock_corrections` MODIFY `total` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `sell_stock_correction_items` MODIFY `unitPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `totalPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- Purchases: money columns, plus split the old paymentStatus
-- (PENDING/APPROVED/REJECTED, which really was the goods-receipt approval)
-- into `status` (receipt) and a real supplier `paymentStatus`.

-- 1. New columns
ALTER TABLE `purchases` ADD COLUMN `status` ENUM('PENDING', 'RECEIVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `amountPaid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `subTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `grandTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- 2. Carry the receipt state over from the old column
UPDATE `purchases` SET `status` = CASE `paymentStatus`
    WHEN 'APPROVED' THEN 'RECEIVED'
    WHEN 'REJECTED' THEN 'REJECTED'
    ELSE 'PENDING'
END;

-- 3. Turn paymentStatus into the payment enum; nothing has been recorded as
-- paid yet, so every existing row becomes UNPAID (via VARCHAR so no old
-- value is rejected by the new enum)
ALTER TABLE `purchases` MODIFY `paymentStatus` VARCHAR(20) NOT NULL DEFAULT 'UNPAID';
UPDATE `purchases` SET `paymentStatus` = 'UNPAID';
ALTER TABLE `purchases` MODIFY `paymentStatus` ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID') NOT NULL DEFAULT 'UNPAID';

-- CreateIndex
CREATE INDEX `purchases_status_idx` ON `purchases`(`status`);
