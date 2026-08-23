-- AlterTable
ALTER TABLE `reconciliation_period` ADD COLUMN `statement_income_total` DECIMAL(19, 2) NULL;
ALTER TABLE `reconciliation_period` ADD COLUMN `statement_expense_total` DECIMAL(19, 2) NULL;

-- CreateTable
CREATE TABLE `statement_line` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `reconciliation_period_id` INTEGER UNSIGNED NOT NULL,
    `posted_at` DATETIME(3) NOT NULL,
    `description` VARCHAR(1500) NOT NULL,
    `amount` DECIMAL(19, 2) NOT NULL,
    `line_type` VARCHAR(64) NULL,
    `match_status` ENUM('unmatched', 'matched', 'statement_only', 'conflict', 'ignored') NOT NULL DEFAULT 'unmatched',
    `register_entry_id` VARCHAR(191) NULL,
    `match_confidence` DECIMAL(5, 4) NULL,
    `match_reason` VARCHAR(500) NULL,
    `ignored_at` DATETIME(3) NULL,
    `sort_index` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `statement_line_period_status_idx`(`reconciliation_period_id`, `match_status`),
    INDEX `statement_line_entry_idx`(`register_entry_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `statement_line` ADD CONSTRAINT `statement_line_reconciliation_period_id_fkey` FOREIGN KEY (`reconciliation_period_id`) REFERENCES `reconciliation_period`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `statement_line` ADD CONSTRAINT `statement_line_register_entry_id_fkey` FOREIGN KEY (`register_entry_id`) REFERENCES `register_entry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
