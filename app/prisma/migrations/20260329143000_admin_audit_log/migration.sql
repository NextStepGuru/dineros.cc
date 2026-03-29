-- CreateTable
CREATE TABLE `admin_audit_log` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `admin_user_id` INTEGER UNSIGNED NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `target_user_id` INTEGER UNSIGNED NULL,
    `target_account_id` VARCHAR(36) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_audit_log_admin_user_id_idx`(`admin_user_id`),
    INDEX `admin_audit_log_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
