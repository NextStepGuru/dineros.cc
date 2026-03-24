-- CreateTable
CREATE TABLE `account_invite` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(500) NOT NULL,
    `invited_by_user_id` INTEGER UNSIGNED NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `account_invite_token_hash_key`(`token_hash`),
    INDEX `account_invite_account_id_email_idx`(`account_id`, `email`),
    INDEX `account_invite_invited_by_user_id_idx`(`invited_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `account_invite` ADD CONSTRAINT `account_invite_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_invite` ADD CONSTRAINT `account_invite_invited_by_user_id_fkey` FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
