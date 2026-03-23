-- AlterTable
ALTER TABLE `reoccurrence_split` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `reoccurrence_split` ADD CONSTRAINT `reoccurrence_split_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
