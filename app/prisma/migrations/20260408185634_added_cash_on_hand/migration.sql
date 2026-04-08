-- CreateTable
CREATE TABLE `cash_on_hand` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_register_id` INTEGER UNSIGNED NOT NULL,
    `ones` INTEGER NOT NULL DEFAULT 0,
    `fives` INTEGER NOT NULL DEFAULT 0,
    `tens` INTEGER NOT NULL DEFAULT 0,
    `twenties` INTEGER NOT NULL DEFAULT 0,
    `fifties` INTEGER NOT NULL DEFAULT 0,
    `hundreds` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cash_on_hand_account_register_id_key`(`account_register_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cash_on_hand` ADD CONSTRAINT `cash_on_hand_account_register_id_fkey` FOREIGN KEY (`account_register_id`) REFERENCES `account_register`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
