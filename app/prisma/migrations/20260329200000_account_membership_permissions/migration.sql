-- UserAccount: capability columns (defaults preserve full access for existing rows)
ALTER TABLE `user_account`
  ADD COLUMN `can_view_budgets` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `can_invite_users` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `can_manage_members` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `allowed_budget_ids` JSON NULL;

-- Targets per invite (multi-account); backfill from legacy account_id column
CREATE TABLE `account_invite_account` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `invite_id` INTEGER UNSIGNED NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `can_view_budgets` BOOLEAN NOT NULL DEFAULT true,
    `can_invite_users` BOOLEAN NOT NULL DEFAULT true,
    `can_manage_members` BOOLEAN NOT NULL DEFAULT true,
    `allowed_budget_ids` JSON NULL,

    UNIQUE INDEX `account_invite_account_invite_id_account_id_key`(`invite_id`, `account_id`),
    INDEX `account_invite_account_account_id_idx`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `account_invite_account` (`invite_id`, `account_id`, `can_view_budgets`, `can_invite_users`, `can_manage_members`)
SELECT `id`, `account_id`, true, true, true FROM `account_invite`;

ALTER TABLE `account_invite` DROP FOREIGN KEY `account_invite_account_id_fkey`;

ALTER TABLE `account_invite` DROP INDEX `account_invite_account_id_email_idx`;

ALTER TABLE `account_invite` DROP COLUMN `account_id`;

ALTER TABLE `account_invite_account`
  ADD CONSTRAINT `account_invite_account_invite_id_fkey` FOREIGN KEY (`invite_id`) REFERENCES `account_invite`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `account_invite_account`
  ADD CONSTRAINT `account_invite_account_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
