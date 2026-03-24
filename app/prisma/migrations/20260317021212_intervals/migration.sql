-- Add new interval for twice-monthly recurrence (15th and last day)
INSERT INTO `interval` (`id`, `type`, `name`, `updated_at`)
VALUES (6, 'twice_monthly', '15th & Last Day', NOW())
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `name` = VALUES(`name`),
  `updated_at` = NOW();
