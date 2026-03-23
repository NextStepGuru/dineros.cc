-- CreateTable
CREATE TABLE `reoccurrence_split` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `reoccurrence_id` INTEGER UNSIGNED NOT NULL,
    `transfer_account_register_id` INTEGER UNSIGNED NOT NULL,
    `amount` DECIMAL(19, 2) NOT NULL,
    `description` VARCHAR(500) NULL,
    `sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reoccurrence_split_reoccurrence_id_idx`(`reoccurrence_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reoccurrence_split` ADD CONSTRAINT `reoccurrence_split_reoccurrence_id_fkey` FOREIGN KEY (`reoccurrence_id`) REFERENCES `reoccurrence`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reoccurrence_split` ADD CONSTRAINT `reoccurrence_split_transfer_account_register_id_fkey` FOREIGN KEY (`transfer_account_register_id`) REFERENCES `account_register`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
