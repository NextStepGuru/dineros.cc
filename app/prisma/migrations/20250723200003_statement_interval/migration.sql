-- AlterTable
ALTER TABLE `account_register` ADD COLUMN `statement_interval_id` INTEGER UNSIGNED NULL;

-- AddForeignKey
ALTER TABLE `account_register` ADD CONSTRAINT `account_register_statement_interval_id_fkey` FOREIGN KEY (`statement_interval_id`) REFERENCES `interval`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
