/*
  Warnings:

  - Made the column `statement_interval_id` on table `account_register` required. This step will fail if there are existing NULL values in that column.

*/

update account_register set statement_interval_id = 3 where statement_interval_id is null;

-- DropForeignKey
ALTER TABLE `account_register` DROP FOREIGN KEY `account_register_statement_interval_id_fkey`;

-- DropIndex
DROP INDEX `account_register_statement_interval_id_fkey` ON `account_register`;

-- AlterTable
ALTER TABLE `account_register` MODIFY `statement_interval_id` INTEGER UNSIGNED NOT NULL DEFAULT 3;

-- AddForeignKey
ALTER TABLE `account_register` ADD CONSTRAINT `account_register_statement_interval_id_fkey` FOREIGN KEY (`statement_interval_id`) REFERENCES `interval`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
