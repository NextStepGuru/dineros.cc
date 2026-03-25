-- AlterTable
ALTER TABLE `reconciliation_period` ADD COLUMN `statement_opening_balance` DECIMAL(19, 2) NOT NULL DEFAULT 0;
