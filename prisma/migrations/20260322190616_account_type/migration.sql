-- Seed / refresh canonical account types (idempotent on `id`).
INSERT INTO `account_type` (`id`, `type`, `name`, `is_credit`, `accrues_balance_growth`, `updated_at`) VALUES
(1, 'checking', 'Checking', 0, 0, '2025-02-03 17:05:09.601'),
(2, 'saving', 'Savings', 0, 1, '2026-03-21 15:17:16.191'),
(3, 'heloc', 'HELOC', 1, 0, '2025-02-03 17:05:09.601'),
(4, 'credit-card', 'Credit Card', 1, 0, '2025-02-03 17:05:09.601'),
(5, 'loan', 'Loan', 1, 0, '2025-02-03 17:05:09.601'),
(6, 'mortgage', 'Mortgage', 1, 0, '2025-02-03 17:05:09.601'),
(7, 'lined-of-credit', 'Line of Credit', 1, 0, '2025-02-03 17:05:09.601'),
(8, 'hsa', 'HSA', 0, 1, '2026-03-21 15:17:16.191'),
(9, 'ira', 'IRA', 0, 1, '2026-03-21 15:17:16.191'),
(10, '401k', '401(k)', 0, 1, '2026-03-21 15:17:16.191'),
(11, 'retirement-plan', 'Retirement Plan', 0, 1, '2026-03-21 15:17:16.191'),
(12, 'student-loan', 'Student Loan', 1, 0, '2025-02-03 17:05:09.601'),
(13, 'auto-loan', 'Auto Loan', 1, 0, '2025-02-03 17:05:09.601'),
(14, 'emergency-fund', 'Emergency Fund', 0, 0, '2025-02-03 17:05:09.601'),
(15, 'pocket', 'Pocket', 0, 0, '2025-02-03 17:05:09.601'),
(16, 'other', 'Other Interest', 0, 1, '2026-03-21 15:17:16.191'),
(17, 'other-credit', 'Other Credit', 1, 0, '2025-02-03 17:05:09.601'),
(18, 'asset', 'General Assset', 0, 0, '2025-02-03 17:05:09.601'),
(19, 'liability', 'General Liability', 0, 0, '2025-02-03 17:05:09.601'),
(20, 'vehicle-asset', 'Vehicle Asset', 0, 0, '2026-03-20 21:49:24.000'),
(21, 'collectable-vehicle', 'Collectable Vehicle', 0, 0, '2026-03-20 21:49:24.000')
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `name` = VALUES(`name`),
  `is_credit` = VALUES(`is_credit`),
  `accrues_balance_growth` = VALUES(`accrues_balance_growth`),
  `updated_at` = VALUES(`updated_at`);
