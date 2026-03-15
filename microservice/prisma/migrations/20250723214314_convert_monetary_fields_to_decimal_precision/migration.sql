/*
  Warnings:

  - You are about to alter the column `min_payment` on the `account_register` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(19,2)`.
  - You are about to alter the column `loan_original_amount` on the `account_register` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(19,2)`.
  - You are about to alter the column `min_account_balance` on the `account_register` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(19,2)`.

*/
-- AlterTable
ALTER TABLE `account_register` MODIFY `balance` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    MODIFY `credit_limit` DECIMAL(19, 2) NULL,
    MODIFY `latest_balance` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    MODIFY `min_payment` DECIMAL(19, 2) NULL,
    MODIFY `loan_original_amount` DECIMAL(19, 2) NULL,
    MODIFY `min_account_balance` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    MODIFY `account_savings_goal` DECIMAL(19, 2) NULL;

-- AlterTable
ALTER TABLE `account_register_summary` MODIFY `balance` DECIMAL(19, 2) NOT NULL;

-- AlterTable
ALTER TABLE `register_entry` MODIFY `amount` DECIMAL(19, 2) NOT NULL,
    MODIFY `balance` DECIMAL(19, 2) NOT NULL;

-- AlterTable
ALTER TABLE `reoccurrence` MODIFY `amount` DECIMAL(19, 2) NOT NULL;
