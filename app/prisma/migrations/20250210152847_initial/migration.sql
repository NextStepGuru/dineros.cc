-- CreateTable
CREATE TABLE `account` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `last_accessed_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `first_name` VARCHAR(255) NULL,
    `last_name` VARCHAR(255) NULL,
    `username` VARCHAR(100) NULL,
    `email` VARCHAR(500) NOT NULL,
    `email_hash` VARCHAR(128) NULL,
    `password` VARCHAR(1000) NULL,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `last_accessed_at` DATETIME(3) NULL,
    `reset_password_at` DATETIME(3) NULL,
    `reset_code` VARCHAR(10) NULL,
    `jwt_key` VARCHAR(100) NULL,
    `config` JSON NULL,
    `settings` JSON NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_email_key`(`email`),
    UNIQUE INDEX `user_email_hash_key`(`email_hash`),
    UNIQUE INDEX `user_jwt_key_key`(`jwt_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_account` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_social` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `access_token` VARCHAR(2000) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `user_id` INTEGER UNSIGNED NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_register` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `sub_account_register_id` INTEGER UNSIGNED NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `type_id` INTEGER UNSIGNED NOT NULL,
    `budget_id` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `balance` DOUBLE NOT NULL DEFAULT 0,
    `credit_limit` DOUBLE NULL,
    `latest_balance` DOUBLE NOT NULL DEFAULT 0,
    `min_payment` DECIMAL(65, 30) NULL,
    `statement_at` DATETIME(3) NOT NULL,
    `apr1` DECIMAL(7, 5) NULL,
    `apr1_start_at` DATETIME(3) NULL,
    `apr2` DECIMAL(7, 5) NULL,
    `apr2_start_at` DATETIME(3) NULL,
    `apr3` DECIMAL(7, 5) NULL,
    `apr3_start_at` DATETIME(3) NULL,
    `target_account_register_id` INTEGER NULL,
    `loan_start_at` DATETIME(3) NULL,
    `loan_payments_per_year` INTEGER NULL,
    `loan_total_years` INTEGER NULL,
    `loan_original_amount` INTEGER NULL,
    `sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `min_account_balance` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `allow_extra_payment` BOOLEAN NOT NULL DEFAULT false,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `plaid_id` VARCHAR(191) NULL,
    `plaid_access_token` VARCHAR(191) NULL,
    `plaid_access_token_hash` VARCHAR(128) NULL,
    `plaid_id_hash` VARCHAR(128) NULL,
    `plaid_json` JSON NULL,
    `plaid_last_sync_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_register_summary` (
    `id` VARCHAR(191) NOT NULL,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `balance` DOUBLE NOT NULL,
    `month` INTEGER UNSIGNED NOT NULL,
    `year` INTEGER UNSIGNED NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `register_entry` (
    `id` VARCHAR(191) NOT NULL,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `checkNo` VARCHAR(191) NULL,
    `description` VARCHAR(191) NOT NULL,
    `reoccurrence_id` INTEGER UNSIGNED NULL,
    `amount` DOUBLE NOT NULL,
    `balance` DOUBLE NOT NULL,
    `is_projected` BOOLEAN NOT NULL DEFAULT false,
    `is_reconciled` BOOLEAN NOT NULL DEFAULT false,
    `is_pending` BOOLEAN NOT NULL DEFAULT false,
    `is_cleared` BOOLEAN NOT NULL DEFAULT false,
    `is_balance_entry` BOOLEAN NOT NULL DEFAULT false,
    `has_balance_re_calc` BOOLEAN NOT NULL DEFAULT false,
    `plaid_id` VARCHAR(191) NULL,
    `plaid_id_hash` VARCHAR(128) NULL,
    `plaid_json` JSON NULL,
    `category_id` VARCHAR(191) NULL,
    `memo` VARCHAR(500) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `register_entry_account_register_id_is_balance_entry_is_pendi_idx`(`account_register_id`, `is_balance_entry`, `is_pending`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category` (
    `id` VARCHAR(191) NOT NULL,
    `sub_category_id` VARCHAR(191) NULL,
    `account_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `accountRegisterId` INTEGER UNSIGNED NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reoccurrence` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` VARCHAR(191) NOT NULL,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `interval_id` INTEGER UNSIGNED NOT NULL,
    `transfer_account_register_id` INTEGER UNSIGNED NULL,
    `interval_count` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `last_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `total_intervals` INTEGER UNSIGNED NULL,
    `elapsed_intervals` INTEGER UNSIGNED NULL,
    `amount` DOUBLE NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reoccurrence_skip` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `reoccurrence_id` INTEGER UNSIGNED NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `skipped_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_type` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `is_credit` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `interval` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rsa` (
    `id` VARCHAR(191) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `public_key` TEXT NOT NULL,
    `private_key` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_account` ADD CONSTRAINT `user_account_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_account` ADD CONSTRAINT `user_account_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_social` ADD CONSTRAINT `user_social_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget` ADD CONSTRAINT `budget_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget` ADD CONSTRAINT `budget_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_register` ADD CONSTRAINT `account_register_budget_id_fkey` FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_register` ADD CONSTRAINT `account_register_type_id_fkey` FOREIGN KEY (`type_id`) REFERENCES `account_type`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_register` ADD CONSTRAINT `account_register_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_register` ADD CONSTRAINT `account_register_sub_account_register_id_fkey` FOREIGN KEY (`sub_account_register_id`) REFERENCES `account_register`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `register_entry` ADD CONSTRAINT `register_entry_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `register_entry` ADD CONSTRAINT `register_entry_reoccurrence_id_fkey` FOREIGN KEY (`reoccurrence_id`) REFERENCES `reoccurrence`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category` ADD CONSTRAINT `category_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category` ADD CONSTRAINT `category_sub_category_id_fkey` FOREIGN KEY (`sub_category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reoccurrence` ADD CONSTRAINT `reoccurrence_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reoccurrence` ADD CONSTRAINT `reoccurrence_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reoccurrence` ADD CONSTRAINT `reoccurrence_interval_id_fkey` FOREIGN KEY (`interval_id`) REFERENCES `interval`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reoccurrence_skip` ADD CONSTRAINT `reoccurrence_skip_reoccurrence_id_fkey` FOREIGN KEY (`reoccurrence_id`) REFERENCES `reoccurrence`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
