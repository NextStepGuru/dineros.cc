-- CreateTable
CREATE TABLE `notification_event` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `budget_id` INTEGER UNSIGNED NOT NULL,
    `kind` ENUM('FORECAST_RISK', 'REOCCURRENCE_HEALTH') NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `occurrence_key` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `payload` JSON NOT NULL,
    `first_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_event_user_budget_kind_active_idx`(`user_id`, `budget_id`, `kind`, `is_active`),
    INDEX `notification_event_budget_kind_active_idx`(`budget_id`, `kind`, `is_active`),
    UNIQUE INDEX `notification_event_user_budget_kind_fingerprint_uidx`(`user_id`, `budget_id`, `kind`, `fingerprint`),
    UNIQUE INDEX `notification_event_user_budget_kind_occurrence_uidx`(`user_id`, `budget_id`, `kind`, `occurrence_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_dismissal` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `budget_id` INTEGER UNSIGNED NOT NULL,
    `kind` ENUM('FORECAST_RISK', 'REOCCURRENCE_HEALTH') NOT NULL,
    `occurrence_key` VARCHAR(191) NOT NULL,
    `dismissed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_dismissal_user_budget_kind_idx`(`user_id`, `budget_id`, `kind`),
    UNIQUE INDEX `notification_dismissal_user_budget_kind_occurrence_uidx`(`user_id`, `budget_id`, `kind`, `occurrence_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notification_event` ADD CONSTRAINT `notification_event_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_event` ADD CONSTRAINT `notification_event_budget_id_fkey` FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_dismissal` ADD CONSTRAINT `notification_dismissal_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_dismissal` ADD CONSTRAINT `notification_dismissal_budget_id_fkey` FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
