-- CreateTable
CREATE TABLE `savings_goal` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` VARCHAR(191) NOT NULL,
    `budget_id` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `target_amount` DECIMAL(12, 2) NOT NULL,
    `source_account_register_id` INTEGER UNSIGNED NOT NULL,
    `target_account_register_id` INTEGER UNSIGNED NOT NULL,
    `priority_over_debt` BOOLEAN NOT NULL DEFAULT false,
    `ignore_min_balance` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `savings_goal_account_id_idx`(`account_id`),
    INDEX `savings_goal_budget_id_idx`(`budget_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `savings_goal` ADD CONSTRAINT `savings_goal_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `savings_goal` ADD CONSTRAINT `savings_goal_budget_id_fkey` FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `savings_goal` ADD CONSTRAINT `savings_goal_source_account_register_id_fkey` FOREIGN KEY (`source_account_register_id`) REFERENCES `account_register`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `savings_goal` ADD CONSTRAINT `savings_goal_target_account_register_id_fkey` FOREIGN KEY (`target_account_register_id`) REFERENCES `account_register`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
