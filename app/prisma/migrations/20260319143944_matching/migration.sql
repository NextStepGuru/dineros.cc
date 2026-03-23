-- CreateTable
CREATE TABLE `reoccurrence_plaid_name_alias` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `normalized_name` VARCHAR(500) NOT NULL,
    `reoccurrence_id` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reoccurrence_plaid_name_alias_account_register_id_idx`(`account_register_id`),
    UNIQUE INDEX `reoccurrence_plaid_name_alias_account_register_id_normalized_key`(`account_register_id`, `normalized_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reoccurrence_plaid_name_alias` ADD CONSTRAINT `reoccurrence_plaid_name_alias_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reoccurrence_plaid_name_alias` ADD CONSTRAINT `reoccurrence_plaid_name_alias_reoccurrence_id_fkey` FOREIGN KEY (`reoccurrence_id`) REFERENCES `reoccurrence`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
