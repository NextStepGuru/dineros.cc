-- AlterTable
ALTER TABLE `account_register` ADD COLUMN `payment_category_id` VARCHAR(191) NULL,
    ADD COLUMN `interest_category_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `account_register` ADD CONSTRAINT `account_register_payment_category_id_fkey` FOREIGN KEY (`payment_category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_register` ADD CONSTRAINT `account_register_interest_category_id_fkey` FOREIGN KEY (`interest_category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
