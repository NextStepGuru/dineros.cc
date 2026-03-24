-- CreateIndex
CREATE INDEX `account_register_account_id_is_archived_idx` ON `account_register`(`account_id`, `is_archived`);

-- CreateIndex
CREATE INDEX `register_entry_account_register_id_is_cleared_is_projected_i_idx` ON `register_entry`(`account_register_id`, `is_cleared`, `is_projected`, `is_manual_entry`);

-- CreateIndex
CREATE INDEX `reoccurrence_account_id_last_at_idx` ON `reoccurrence`(`account_id`, `last_at`);

-- CreateIndex
CREATE INDEX `user_account_user_id_account_id_idx` ON `user_account`(`user_id`, `account_id`);
