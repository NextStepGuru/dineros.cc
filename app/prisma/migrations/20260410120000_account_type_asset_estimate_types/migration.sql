-- House, Boat, RV, Motorcycle asset types (idempotent on primary key `id`).
INSERT INTO `account_type` (`id`, `type`, `name`, `is_credit`, `accrues_balance_growth`, `updated_at`) VALUES
(23, 'house-asset', 'House / Real Estate', 0, 0, CURRENT_TIMESTAMP(3)),
(24, 'boat-asset', 'Boat', 0, 0, CURRENT_TIMESTAMP(3)),
(25, 'rv-asset', 'RV / Motorhome', 0, 0, CURRENT_TIMESTAMP(3)),
(26, 'motorcycle-asset', 'Motorcycle', 0, 0, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `name` = VALUES(`name`),
  `is_credit` = VALUES(`is_credit`),
  `accrues_balance_growth` = VALUES(`accrues_balance_growth`),
  `updated_at` = VALUES(`updated_at`);
