-- Online orders from the e-commerce shop wait here until store management
-- picks the shop for each line; then they become a normal sale (source
-- ECOMMERCE). Nothing existing changes.

-- CreateTable
CREATE TABLE `online_orders` (
    `_id` CHAR(36) NOT NULL,
    `external_order_id` VARCHAR(64) NOT NULL,
    `external_order_number` VARCHAR(64) NOT NULL,
    `status` ENUM('NEW', 'CONVERTED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
    `customer_id` CHAR(36) NULL,
    `customer_name` VARCHAR(255) NOT NULL,
    `customer_phone` VARCHAR(50) NULL,
    `company_name` VARCHAR(255) NULL,
    `tin_number` VARCHAR(100) NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `discount_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `delivery_fee` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(14, 2) NOT NULL,
    `notes` TEXT NULL,
    `payload` JSON NOT NULL,
    `sell_id` CHAR(36) NULL,
    `converted_by_id` CHAR(36) NULL,
    `converted_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `online_orders_external_order_id_key`(`external_order_id`),
    UNIQUE INDEX `online_orders_sell_id_key`(`sell_id`),
    INDEX `online_orders_status_received_at_idx`(`status`, `received_at`),
    PRIMARY KEY (`_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `online_order_items` (
    `_id` CHAR(36) NOT NULL,
    `online_order_id` CHAR(36) NOT NULL,
    `line_no` INTEGER NOT NULL DEFAULT 0,
    `product_id` CHAR(36) NOT NULL,
    `sub_product_id` CHAR(36) NULL,
    `quantity` INTEGER NOT NULL,
    `unit_price` DECIMAL(14, 2) NOT NULL,
    `total_price` DECIMAL(14, 2) NOT NULL,
    `shop_id` CHAR(36) NULL,

    INDEX `online_order_items_online_order_id_idx`(`online_order_id`),
    PRIMARY KEY (`_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `online_orders` ADD CONSTRAINT `online_orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `online_orders` ADD CONSTRAINT `online_orders_sell_id_fkey` FOREIGN KEY (`sell_id`) REFERENCES `sells`(`_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `online_orders` ADD CONSTRAINT `online_orders_converted_by_id_fkey` FOREIGN KEY (`converted_by_id`) REFERENCES `users`(`_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `online_order_items` ADD CONSTRAINT `online_order_items_online_order_id_fkey` FOREIGN KEY (`online_order_id`) REFERENCES `online_orders`(`_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `online_order_items` ADD CONSTRAINT `online_order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `online_order_items` ADD CONSTRAINT `online_order_items_sub_product_id_fkey` FOREIGN KEY (`sub_product_id`) REFERENCES `sub_products`(`_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `online_order_items` ADD CONSTRAINT `online_order_items_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`_id`) ON DELETE SET NULL ON UPDATE CASCADE;

