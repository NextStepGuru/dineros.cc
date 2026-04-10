-- CreateTable
CREATE TABLE `plaid_sync_log` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sync_mode` VARCHAR(32) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `item_id` VARCHAR(191) NULL,
    `user_id` INTEGER UNSIGNED NULL,
    `duration_ms` INTEGER NULL,
    `tx_added` INTEGER NOT NULL DEFAULT 0,
    `tx_modified` INTEGER NOT NULL DEFAULT 0,
    `tx_removed` INTEGER NOT NULL DEFAULT 0,
    `new_entries` INTEGER NOT NULL DEFAULT 0,
    `matched_entries` INTEGER NOT NULL DEFAULT 0,
    `error_count` INTEGER NOT NULL DEFAULT 0,
    `error_summary` TEXT NULL,
    `metadata` JSON NULL,

    INDEX `plaid_sync_log_created_at_idx`(`created_at`),
    INDEX `plaid_sync_log_sync_mode_idx`(`sync_mode`),
    INDEX `plaid_sync_log_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
