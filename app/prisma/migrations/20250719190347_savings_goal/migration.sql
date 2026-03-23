-- AlterTable
ALTER TABLE `account_register` ADD COLUMN `account_savings_goal` DOUBLE NULL,
    ADD COLUMN `savings_goal_sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 0;
