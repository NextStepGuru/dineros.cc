-- AlterTable
ALTER TABLE `reoccurrence` ADD COLUMN `amount_adjustment_anchor_at` DATETIME(3) NULL,
    ADD COLUMN `amount_adjustment_direction` ENUM('INCREASE', 'DECREASE') NULL,
    ADD COLUMN `amount_adjustment_interval_count` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    ADD COLUMN `amount_adjustment_interval_id` INTEGER UNSIGNED NULL,
    ADD COLUMN `amount_adjustment_mode` ENUM('NONE', 'PERCENT', 'FIXED') NOT NULL DEFAULT 'NONE',
    ADD COLUMN `amount_adjustment_value` DECIMAL(19, 6) NULL;

-- AddForeignKey
ALTER TABLE `reoccurrence` ADD CONSTRAINT `reoccurrence_amount_adjustment_interval_id_fkey` FOREIGN KEY (`amount_adjustment_interval_id`) REFERENCES `interval`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
