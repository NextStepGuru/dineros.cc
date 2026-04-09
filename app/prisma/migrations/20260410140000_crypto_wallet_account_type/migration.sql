-- Crypto wallet account type (id 27; 23–26 reserved for real-estate / vehicle asset types).
INSERT INTO `account_type` (`id`, `type`, `name`, `class`, `is_credit`, `accrues_balance_growth`, `updated_at`)
VALUES (27, 'crypto-wallet', 'Crypto Wallet', 'crypto', 0, 0, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `name` = VALUES(`name`),
  `class` = VALUES(`class`),
  `is_credit` = VALUES(`is_credit`),
  `accrues_balance_growth` = VALUES(`accrues_balance_growth`),
  `updated_at` = VALUES(`updated_at`);
