-- AlterTable
ALTER TABLE `account_register` MODIFY `sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 999,
    MODIFY `loan_payment_sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 999,
    MODIFY `savings_goal_sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 999;
