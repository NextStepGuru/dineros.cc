-- AlterTable
ALTER TABLE `user_account` ADD COLUMN `allowed_account_register_ids` JSON NULL;

-- AlterTable
ALTER TABLE `account_invite_account` ADD COLUMN `allowed_account_register_ids` JSON NULL;
