-- AlterTable
ALTER TABLE `register_entry` ADD COLUMN `type_id` INTEGER UNSIGNED NULL;

-- CreateTable
CREATE TABLE `register_entry_type` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `register_entry` ADD CONSTRAINT `register_entry_type_id_fkey` FOREIGN KEY (`type_id`) REFERENCES `register_entry_type`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
