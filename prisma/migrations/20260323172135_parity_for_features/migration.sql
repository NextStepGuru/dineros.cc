-- CreateTable
CREATE TABLE `bill_profile` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` VARCHAR(191) NOT NULL,
    `budget_id` INTEGER UNSIGNED NOT NULL,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `reoccurrence_id` INTEGER UNSIGNED NOT NULL,
    `kind` ENUM('BILL', 'INCOME', 'TRANSFER') NOT NULL DEFAULT 'BILL',
    `payee` VARCHAR(255) NULL,
    `is_auto_pay` BOOLEAN NOT NULL DEFAULT false,
    `grace_days` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `expected_amount_low` DECIMAL(19, 2) NULL,
    `expected_amount_high` DECIMAL(19, 2) NULL,
    `reminder_days_before` VARCHAR(100) NULL,
    `priority` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bill_profile_reoccurrence_id_key`(`reoccurrence_id`),
    INDEX `bill_profile_budget_kind_archived_idx`(`budget_id`, `kind`, `is_archived`),
    INDEX `bill_profile_register_idx`(`account_register_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bill_instance` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` VARCHAR(191) NOT NULL,
    `budget_id` INTEGER UNSIGNED NOT NULL,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `reoccurrence_id` INTEGER UNSIGNED NOT NULL,
    `bill_profile_id` INTEGER UNSIGNED NOT NULL,
    `due_at` DATETIME(3) NOT NULL,
    `amount` DECIMAL(19, 2) NOT NULL,
    `status` ENUM('UPCOMING', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'PAID', 'SKIPPED', 'PARTIAL') NOT NULL DEFAULT 'UPCOMING',
    `paid_at` DATETIME(3) NULL,
    `paid_amount` DECIMAL(19, 2) NULL,
    `paid_register_entry_id` VARCHAR(191) NULL,
    `reminder_last_sent_at` DATETIME(3) NULL,
    `note` VARCHAR(500) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bill_instance_budget_status_due_idx`(`budget_id`, `status`, `due_at`),
    INDEX `bill_instance_register_due_idx`(`account_register_id`, `due_at`),
    UNIQUE INDEX `bill_instance_profile_due_uidx`(`bill_profile_id`, `due_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reconciliation_period` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` VARCHAR(191) NOT NULL,
    `budget_id` INTEGER UNSIGNED NOT NULL,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `statement_ending_balance` DECIMAL(19, 2) NOT NULL,
    `ledger_cleared_balance` DECIMAL(19, 2) NULL,
    `difference_amount` DECIMAL(19, 2) NULL,
    `closed_at` DATETIME(3) NULL,
    `closed_by_user_id` INTEGER UNSIGNED NULL,
    `closing_adjustment_entry_id` VARCHAR(191) NULL,
    `close_note` VARCHAR(500) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reconciliation_period_budget_status_register_idx`(`budget_id`, `status`, `account_register_id`),
    INDEX `reconciliation_period_register_window_idx`(`account_register_id`, `start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reconciliation_item` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `reconciliation_period_id` INTEGER UNSIGNED NOT NULL,
    `register_entry_id` VARCHAR(191) NOT NULL,
    `is_cleared` BOOLEAN NOT NULL DEFAULT false,
    `cleared_at` DATETIME(3) NULL,
    `note` VARCHAR(500) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reconciliation_item_entry_idx`(`register_entry_id`),
    UNIQUE INDEX `reconciliation_item_period_entry_uidx`(`reconciliation_period_id`, `register_entry_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bill_profile` ADD CONSTRAINT `bill_profile_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_profile` ADD CONSTRAINT `bill_profile_budget_id_fkey` FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_profile` ADD CONSTRAINT `bill_profile_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_profile` ADD CONSTRAINT `bill_profile_reoccurrence_id_fkey` FOREIGN KEY (`reoccurrence_id`) REFERENCES `reoccurrence`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_instance` ADD CONSTRAINT `bill_instance_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_instance` ADD CONSTRAINT `bill_instance_budget_id_fkey` FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_instance` ADD CONSTRAINT `bill_instance_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_instance` ADD CONSTRAINT `bill_instance_reoccurrence_id_fkey` FOREIGN KEY (`reoccurrence_id`) REFERENCES `reoccurrence`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_instance` ADD CONSTRAINT `bill_instance_bill_profile_id_fkey` FOREIGN KEY (`bill_profile_id`) REFERENCES `bill_profile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_instance` ADD CONSTRAINT `bill_instance_paid_register_entry_id_fkey` FOREIGN KEY (`paid_register_entry_id`) REFERENCES `register_entry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reconciliation_period` ADD CONSTRAINT `reconciliation_period_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reconciliation_period` ADD CONSTRAINT `reconciliation_period_budget_id_fkey` FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reconciliation_period` ADD CONSTRAINT `reconciliation_period_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reconciliation_period` ADD CONSTRAINT `reconciliation_period_closed_by_user_id_fkey` FOREIGN KEY (`closed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reconciliation_period` ADD CONSTRAINT `reconciliation_period_closing_adjustment_entry_id_fkey` FOREIGN KEY (`closing_adjustment_entry_id`) REFERENCES `register_entry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reconciliation_item` ADD CONSTRAINT `reconciliation_item_reconciliation_period_id_fkey` FOREIGN KEY (`reconciliation_period_id`) REFERENCES `reconciliation_period`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reconciliation_item` ADD CONSTRAINT `reconciliation_item_register_entry_id_fkey` FOREIGN KEY (`register_entry_id`) REFERENCES `register_entry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
