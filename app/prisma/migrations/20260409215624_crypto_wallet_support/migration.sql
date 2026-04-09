-- AlterTable
ALTER TABLE `account_register` ADD COLUMN `alchemy_json` JSON NULL,
    ADD COLUMN `alchemy_last_sync_at` DATETIME(3) NULL,
    ADD COLUMN `wallet_address` VARCHAR(500) NULL,
    ADD COLUMN `wallet_address_hash` VARCHAR(128) NULL;

-- AlterTable
ALTER TABLE `account_type` ADD COLUMN `class` VARCHAR(20) NOT NULL DEFAULT 'fiat';

-- CreateTable
CREATE TABLE `evm_chain` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `network_id` VARCHAR(50) NOT NULL,
    `symbol` VARCHAR(10) NOT NULL,
    `explorer` VARCHAR(500) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `evm_chain_network_id_key`(`network_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crypto_register_chain` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `evm_chain_id` INTEGER UNSIGNED NOT NULL,

    UNIQUE INDEX `crypto_register_chain_account_register_id_evm_chain_id_key`(`account_register_id`, `evm_chain_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crypto_token_balance` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `network` VARCHAR(50) NOT NULL,
    `token_address` VARCHAR(100) NULL,
    `token_name` VARCHAR(200) NOT NULL,
    `token_symbol` VARCHAR(20) NOT NULL,
    `token_decimals` INTEGER NOT NULL DEFAULT 18,
    `token_balance` VARCHAR(100) NOT NULL,
    `display_balance` DECIMAL(36, 18) NOT NULL,
    `price_usd` DECIMAL(19, 8) NULL,
    `value_usd` DECIMAL(19, 2) NULL,
    `logo_url` VARCHAR(500) NULL,
    `synced_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `crypto_token_balance_account_register_id_idx`(`account_register_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `crypto_register_chain` ADD CONSTRAINT `crypto_register_chain_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crypto_register_chain` ADD CONSTRAINT `crypto_register_chain_evm_chain_id_fkey` FOREIGN KEY (`evm_chain_id`) REFERENCES `evm_chain`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crypto_token_balance` ADD CONSTRAINT `crypto_token_balance_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
