-- AlterTable
ALTER TABLE `account_register` MODIFY `name` VARCHAR(500) NOT NULL,
    MODIFY `plaid_id` VARCHAR(500) NULL,
    MODIFY `plaid_access_token` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `register_entry` MODIFY `description` VARCHAR(1500) NOT NULL,
    MODIFY `plaid_id` VARCHAR(500) NULL;
