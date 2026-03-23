/*
  Warnings:

  - A unique constraint covering the columns `[collateral_asset_register_id]` on the table `account_register` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `account_register` ADD COLUMN `collateral_asset_register_id` INTEGER UNSIGNED NULL;

-- CreateIndex
CREATE UNIQUE INDEX `account_register_collateral_asset_unique` ON `account_register`(`collateral_asset_register_id`);

-- AddForeignKey
ALTER TABLE `account_register` ADD CONSTRAINT `account_register_collateral_asset_register_id_fkey` FOREIGN KEY (`collateral_asset_register_id`) REFERENCES `account_register`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
