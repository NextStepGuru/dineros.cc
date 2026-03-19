-- =============================================================================
-- Seed common personal-finance categories (parents + subcategories)
-- Target: MySQL 8.0+ `category` table (Prisma @@map("category"))
--
-- NOTE: `sub_category_id` references the PARENT row (top-level rows use NULL).
--
-- Usage:
--   1. Ensure unique index exists once per database (e.g. after Prisma migration
--      `20260319131120_seed_categories`, or run manually):
--        CREATE UNIQUE INDEX `category_account_parent_name_uidx` ON `category` (
--          `account_id`,
--          (IFNULL(`sub_category_id`, '')),
--          `name`(191)
--        );
--   2. Set @account_id to your `account.id` (UUID string).
--   3. Run this script (safe to repeat).
--
-- Idempotent: ON DUPLICATE KEY UPDATE un-archives and bumps `updated_at`.
-- =============================================================================

SET @account_id = '00000000-0000-0000-0000-000000000000'; -- <-- replace with real account UUID

INSERT INTO `category` (`id`, `sub_category_id`, `account_id`, `name`, `is_archived`, `updated_at`)
SELECT
  s.`id`,
  s.`sub_category_id`,
  s.`account_id`,
  s.`name`,
  s.`is_archived`,
  s.`updated_at`
FROM (
  SELECT
    UUID() AS `id`,
    CAST(NULL AS CHAR(191)) AS `sub_category_id`,
    @account_id AS `account_id`,
    v.`name` AS `name`,
    CAST(0 AS UNSIGNED) AS `is_archived`,
    NOW(3) AS `updated_at`
  FROM (
    SELECT 'Income' AS `name` UNION ALL
    SELECT 'Housing' UNION ALL
    SELECT 'Utilities' UNION ALL
    SELECT 'Food & Dining' UNION ALL
    SELECT 'Transportation' UNION ALL
    SELECT 'Insurance' UNION ALL
    SELECT 'Healthcare' UNION ALL
    SELECT 'Debt Payments' UNION ALL
    SELECT 'Savings & Investments' UNION ALL
    SELECT 'Transfers' UNION ALL
    SELECT 'Education' UNION ALL
    SELECT 'Personal Care' UNION ALL
    SELECT 'Entertainment' UNION ALL
    SELECT 'Shopping' UNION ALL
    SELECT 'Travel' UNION ALL
    SELECT 'Gifts & Donations' UNION ALL
    SELECT 'Taxes' UNION ALL
    SELECT 'Pets' UNION ALL
    SELECT 'Subscriptions & Software' UNION ALL
    SELECT 'Business'
  ) AS v
) AS s
ON DUPLICATE KEY UPDATE
  `is_archived` = false,
  `updated_at` = NOW(3);

INSERT INTO `category` (`id`, `sub_category_id`, `account_id`, `name`, `is_archived`, `updated_at`)
SELECT
  s.`id`,
  s.`sub_category_id`,
  s.`account_id`,
  s.`name`,
  s.`is_archived`,
  s.`updated_at`
FROM (
  SELECT
    UUID() AS `id`,
    p.`id` AS `sub_category_id`,
    p.`account_id` AS `account_id`,
    v.`child_name` AS `name`,
    CAST(0 AS UNSIGNED) AS `is_archived`,
    NOW(3) AS `updated_at`
  FROM (
  SELECT 'Income' AS parent_name, 'Salary & Wages' AS child_name UNION ALL
  SELECT 'Income', 'Bonus & Commission' UNION ALL
  SELECT 'Income', 'Interest Income' UNION ALL
  SELECT 'Income', 'Dividend Income' UNION ALL
  SELECT 'Income', 'Refunds & Reimbursements' UNION ALL
  SELECT 'Income', 'Other Income' UNION ALL
  SELECT 'Housing', 'Rent & Mortgage' UNION ALL
  SELECT 'Housing', 'Property Tax' UNION ALL
  SELECT 'Housing', 'HOA' UNION ALL
  SELECT 'Housing', 'Home Insurance' UNION ALL
  SELECT 'Housing', 'Maintenance & Repairs' UNION ALL
  SELECT 'Housing', 'Furnishings' UNION ALL
  SELECT 'Utilities', 'Electric' UNION ALL
  SELECT 'Utilities', 'Natural Gas' UNION ALL
  SELECT 'Utilities', 'Water & Sewer' UNION ALL
  SELECT 'Utilities', 'Internet' UNION ALL
  SELECT 'Utilities', 'Phone & Mobile' UNION ALL
  SELECT 'Utilities', 'Trash & Recycling' UNION ALL
  SELECT 'Food & Dining', 'Groceries' UNION ALL
  SELECT 'Food & Dining', 'Restaurants & Takeout' UNION ALL
  SELECT 'Food & Dining', 'Coffee & Snacks' UNION ALL
  SELECT 'Food & Dining', 'Alcohol & Bars' UNION ALL
  SELECT 'Transportation', 'Fuel' UNION ALL
  SELECT 'Transportation', 'Auto Payment / Lease' UNION ALL
  SELECT 'Transportation', 'Auto Insurance' UNION ALL
  SELECT 'Transportation', 'Maintenance & Repairs' UNION ALL
  SELECT 'Transportation', 'Parking & Tolls' UNION ALL
  SELECT 'Transportation', 'Public Transit' UNION ALL
  SELECT 'Transportation', 'Rideshare' UNION ALL
  SELECT 'Insurance', 'Health Insurance (non-payroll)' UNION ALL
  SELECT 'Insurance', 'Life Insurance' UNION ALL
  SELECT 'Insurance', 'Disability Insurance' UNION ALL
  SELECT 'Insurance', 'Other Insurance' UNION ALL
  SELECT 'Healthcare', 'Doctor & Clinic' UNION ALL
  SELECT 'Healthcare', 'Pharmacy' UNION ALL
  SELECT 'Healthcare', 'Dental' UNION ALL
  SELECT 'Healthcare', 'Vision' UNION ALL
  SELECT 'Healthcare', 'Mental Health' UNION ALL
  SELECT 'Healthcare', 'Gym & Fitness' UNION ALL
  SELECT 'Debt Payments', 'Credit Card Payment' UNION ALL
  SELECT 'Debt Payments', 'Student Loan' UNION ALL
  SELECT 'Debt Payments', 'Personal Loan' UNION ALL
  SELECT 'Debt Payments', 'Other Debt' UNION ALL
  SELECT 'Savings & Investments', 'Emergency Fund' UNION ALL
  SELECT 'Savings & Investments', 'Retirement (401k/IRA)' UNION ALL
  SELECT 'Savings & Investments', 'Brokerage / Taxable' UNION ALL
  SELECT 'Savings & Investments', 'HSA' UNION ALL
  SELECT 'Savings & Investments', 'Education Savings' UNION ALL
  SELECT 'Transfers', 'Account Transfer' UNION ALL
  SELECT 'Transfers', 'Credit Card Payment (transfer)' UNION ALL
  SELECT 'Transfers', 'Internal Transfer' UNION ALL
  SELECT 'Education', 'Tuition' UNION ALL
  SELECT 'Education', 'Books & Supplies' UNION ALL
  SELECT 'Education', 'Courses & Training' UNION ALL
  SELECT 'Personal Care', 'Haircuts & Spa' UNION ALL
  SELECT 'Personal Care', 'Clothing' UNION ALL
  SELECT 'Personal Care', 'Personal Items' UNION ALL
  SELECT 'Entertainment', 'Streaming & Media' UNION ALL
  SELECT 'Entertainment', 'Hobbies' UNION ALL
  SELECT 'Entertainment', 'Sports & Recreation' UNION ALL
  SELECT 'Entertainment', 'Games & Events' UNION ALL
  SELECT 'Shopping', 'Electronics' UNION ALL
  SELECT 'Shopping', 'Home Goods' UNION ALL
  SELECT 'Shopping', 'General Merchandise' UNION ALL
  SELECT 'Travel', 'Flights' UNION ALL
  SELECT 'Travel', 'Lodging' UNION ALL
  SELECT 'Travel', 'Rental Car' UNION ALL
  SELECT 'Travel', 'Vacation & Activities' UNION ALL
  SELECT 'Gifts & Donations', 'Gifts' UNION ALL
  SELECT 'Gifts & Donations', 'Charity & Donations' UNION ALL
  SELECT 'Taxes', 'Federal Income Tax' UNION ALL
  SELECT 'Taxes', 'State & Local Tax' UNION ALL
  SELECT 'Taxes', 'Estimated Tax' UNION ALL
  SELECT 'Pets', 'Vet & Medical' UNION ALL
  SELECT 'Pets', 'Food & Supplies' UNION ALL
  SELECT 'Pets', 'Grooming & Boarding' UNION ALL
  SELECT 'Subscriptions & Software', 'Software & SaaS' UNION ALL
  SELECT 'Subscriptions & Software', 'News & Productivity' UNION ALL
  SELECT 'Subscriptions & Software', 'Cloud Storage' UNION ALL
  SELECT 'Business', 'Office Supplies' UNION ALL
  SELECT 'Business', 'Professional Services' UNION ALL
  SELECT 'Business', 'Advertising' UNION ALL
  SELECT 'Business', 'Contractors'
  ) AS v
  JOIN (
    SELECT
      MIN(pc.`id`) AS `id`,
      MAX(pc.`account_id`) AS `account_id`,
      pc.`name`
    FROM `category` pc
    WHERE pc.`account_id` = @account_id AND pc.`sub_category_id` IS NULL
    GROUP BY pc.`name`
  ) AS p ON p.`name` = v.`parent_name`
) AS s
ON DUPLICATE KEY UPDATE
  `is_archived` = false,
  `updated_at` = NOW(3);
