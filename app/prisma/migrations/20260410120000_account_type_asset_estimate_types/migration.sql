-- House, Boat, RV, Motorcycle asset types (idempotent on primary key `id`).
INSERT INTO `account_type` (`id`, `type`, `name`, `class`, `is_credit`, `accrues_balance_growth`, `updated_at`) VALUES
(23, 'house-asset', 'House / Real Estate', 'fiat', 0, 0, CURRENT_TIMESTAMP(3)),
(24, 'boat-asset', 'Boat', 'fiat', 0, 0, CURRENT_TIMESTAMP(3)),
(25, 'rv-asset', 'RV / Motorhome', 'fiat', 0, 0, CURRENT_TIMESTAMP(3)),
(26, 'motorcycle-asset', 'Motorcycle', 'fiat', 0, 0, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `name` = VALUES(`name`),
  `class` = VALUES(`class`),
  `is_credit` = VALUES(`is_credit`),
  `accrues_balance_growth` = VALUES(`accrues_balance_growth`),
  `updated_at` = VALUES(`updated_at`);
