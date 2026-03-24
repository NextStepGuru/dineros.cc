-- Seed / refresh canonical register_entry_type rows (idempotent on `id`).
INSERT INTO `register_entry_type` (`id`, `name`, `updated_at`) VALUES
(1, 'Balance Entry', '2025-07-28 16:12:17.000'),
(2, 'Interest Charge', '2025-07-28 16:12:17.000'),
(3, 'Interest Earned', '2025-07-28 16:12:17.000'),
(4, 'Loan Payment', '2025-07-28 16:12:17.000'),
(5, 'Credit Card Payment', '2025-07-28 16:12:17.000'),
(6, 'Transfer', '2025-07-28 16:12:17.000'),
(7, 'Manual Entry', '2025-07-28 16:12:17.000'),
(8, 'Plaid Transaction', '2025-07-28 16:12:17.000'),
(9, 'Reoccurrence Entry', '2025-07-28 16:12:17.000'),
(10, 'Initial Balance', '2025-07-28 16:12:17.000')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `updated_at` = VALUES(`updated_at`);
