-- CreateTable
CREATE TABLE `account_snapshot` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `account_snapshot_account_id_created_at_idx`(`account_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_register_snapshot` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `snapshot_id` INTEGER UNSIGNED NOT NULL,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `sub_account_register_id` INTEGER UNSIGNED NULL,
    `collateral_asset_register_id` INTEGER UNSIGNED NULL,
    `name` VARCHAR(500) NOT NULL,
    `balance` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    `latest_balance` DECIMAL(19, 2) NOT NULL DEFAULT 0,
    `type_id` INTEGER UNSIGNED NOT NULL,

    INDEX `account_register_snapshot_snapshot_id_idx`(`snapshot_id`),
    INDEX `account_register_snapshot_account_register_id_idx`(`account_register_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `register_entry_snapshot` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `register_snapshot_id` INTEGER UNSIGNED NOT NULL,
    `seq` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL,
    `description` VARCHAR(1500) NOT NULL,
    `amount` DECIMAL(19, 2) NOT NULL,
    `balance` DECIMAL(19, 2) NOT NULL,
    `is_projected` BOOLEAN NOT NULL DEFAULT false,
    `is_pending` BOOLEAN NOT NULL DEFAULT false,
    `is_balance_entry` BOOLEAN NOT NULL DEFAULT false,
    `is_manual_entry` BOOLEAN NOT NULL DEFAULT false,
    `category_id` VARCHAR(191) NULL,

    INDEX `register_entry_snapshot_register_snapshot_id_created_at_idx`(`register_snapshot_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `account_snapshot` ADD CONSTRAINT `account_snapshot_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_register_snapshot` ADD CONSTRAINT `account_register_snapshot_snapshot_id_fkey` FOREIGN KEY (`snapshot_id`) REFERENCES `account_snapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_register_snapshot` ADD CONSTRAINT `account_register_snapshot_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `register_entry_snapshot` ADD CONSTRAINT `register_entry_snapshot_register_snapshot_id_fkey` FOREIGN KEY (`register_snapshot_id`) REFERENCES `account_register_snapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
