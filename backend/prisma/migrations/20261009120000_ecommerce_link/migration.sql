-- Link to the e-commerce system: where a sale came from (stock or an online
-- order, with the order's id), the e-commerce customer id, and an outbox of
-- messages to send to the e-commerce system. Existing sales become STOCK.

-- AlterTable
ALTER TABLE `customers` ADD COLUMN `external_customer_id` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `sells` ADD COLUMN `external_order_id` VARCHAR(64) NULL,
    ADD COLUMN `external_order_number` VARCHAR(64) NULL,
    ADD COLUMN `source` ENUM('STOCK', 'ECOMMERCE') NOT NULL DEFAULT 'STOCK';

-- CreateTable
CREATE TABLE `integration_outbox` (
    `_id` CHAR(36) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `aggregate_id` CHAR(36) NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `integration_outbox_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    INDEX `integration_outbox_type_aggregate_id_idx`(`type`, `aggregate_id`),
    PRIMARY KEY (`_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `customers_external_customer_id_key` ON `customers`(`external_customer_id`);

-- CreateIndex
CREATE UNIQUE INDEX `sells_external_order_id_key` ON `sells`(`external_order_id`);

-- CreateIndex
CREATE INDEX `sells_source_saleDate_idx` ON `sells`(`source`, `saleDate`);

