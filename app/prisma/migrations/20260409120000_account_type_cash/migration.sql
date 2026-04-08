-- Canonical cash account type (idempotent on primary key `id`).
INSERT INTO `account_type` (`id`, `type`, `name`, `is_credit`, `accrues_balance_growth`, `updated_at`) VALUES
(22, 'cash', 'Cash', 0, 0, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `name` = VALUES(`name`),
  `is_credit` = VALUES(`is_credit`),
  `accrues_balance_growth` = VALUES(`accrues_balance_growth`),
  `updated_at` = VALUES(`updated_at`);
