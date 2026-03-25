/*
  Warnings:

  - You are about to alter the column `seq` on the `register_entry` table. The data in that column could be lost. The data in that column will be cast from `Int` to `UnsignedInt`.

*/
-- AlterTable
ALTER TABLE `account_register` ADD COLUMN `loan_payment_sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `register_entry` MODIFY `seq` INTEGER UNSIGNED NULL;

UPDATE `account_register` SET `loan_payment_sort_order` = `sort_order`;
