-- Seed / refresh canonical intervals (idempotent on `id`).
INSERT INTO `interval` (`id`, `type`, `name`, `updated_at`) VALUES
(1, 'day', 'Day', '2025-02-03 17:05:09.709'),
(2, 'week', 'Week', '2025-02-03 17:05:09.709'),
(3, 'month', 'Month', '2025-02-03 17:05:09.709'),
(4, 'year', 'Year', '2025-02-03 17:05:09.709'),
(5, 'once', 'One-Time', '2025-02-03 17:05:09.709'),
(6, 'twice_monthly', '15th & Last Day', '2026-03-17 09:42:28.000')
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `name` = VALUES(`name`),
  `updated_at` = VALUES(`updated_at`);
