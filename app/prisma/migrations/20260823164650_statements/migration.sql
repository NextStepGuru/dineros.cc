-- AlterTable
ALTER TABLE `register_entry` ADD COLUMN `category_locked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `category_source` VARCHAR(32) NULL;

-- CreateTable
CREATE TABLE `merchant_category_rule` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `merchant_key` VARCHAR(191) NOT NULL,
    `merchant_entity_id` VARCHAR(191) NULL,
    `category_id` VARCHAR(191) NOT NULL,
    `apply_mode` VARCHAR(16) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `merchant_category_rule_account_id_merchant_entity_id_idx`(`account_id`, `merchant_entity_id`),
    UNIQUE INDEX `merchant_category_rule_account_id_merchant_key_key`(`account_id`, `merchant_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `merchant_category_rule` ADD CONSTRAINT `merchant_category_rule_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_category_rule` ADD CONSTRAINT `merchant_category_rule_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
