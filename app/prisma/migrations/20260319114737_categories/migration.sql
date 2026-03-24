-- AlterTable
ALTER TABLE `reoccurrence` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `reoccurrence` ADD CONSTRAINT `reoccurrence_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
