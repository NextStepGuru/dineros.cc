-- CreateTable
CREATE TABLE `integration_job_log` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(32) NOT NULL,
    `queue_name` VARCHAR(64) NOT NULL,
    `job_id` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `item_id` VARCHAR(191) NULL,
    `metadata` JSON NULL,

    INDEX `integration_job_log_created_at_idx`(`created_at`),
    INDEX `integration_job_log_source_idx`(`source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
