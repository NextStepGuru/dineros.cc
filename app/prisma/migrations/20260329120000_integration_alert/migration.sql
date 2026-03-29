-- CreateTable
CREATE TABLE `integration_alert` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(32) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `message` TEXT NOT NULL,
    `http_status` INTEGER NULL,
    `details` JSON NULL,
    `dedupe_key` VARCHAR(191) NULL,

    INDEX `integration_alert_created_at_idx`(`created_at`),
    INDEX `integration_alert_source_idx`(`source`),
    INDEX `integration_alert_kind_idx`(`kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
