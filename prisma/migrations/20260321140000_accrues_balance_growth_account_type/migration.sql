-- =============================================================================
-- account_type: accrues_balance_growth (idempotent ADD + seed upsert)
-- =============================================================================

SET @col_abg = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'account_type'
    AND COLUMN_NAME = 'accrues_balance_growth'
);

SET @sql_abg = IF(@col_abg = 0,
  'ALTER TABLE `account_type`
    ADD COLUMN `accrues_balance_growth` BOOLEAN NOT NULL DEFAULT false
    AFTER `is_credit`',
  'SELECT "Column accrues_balance_growth already exists" AS message'
);

PREPARE stmt_abg FROM @sql_abg;
EXECUTE stmt_abg;
DEALLOCATE PREPARE stmt_abg;

-- Upsert: set growth flag for savings + HSA + IRA + 401k-style + retirement + brokerage
-- ON DUPLICATE KEY UPDATE only touches accrues_balance_growth + updated_at (not type/name).
INSERT INTO `account_type` (`id`, `type`, `name`, `is_credit`, `accrues_balance_growth`, `updated_at`)
VALUES
  (2,  'savings',          'Savings',          false, true, NOW(3)),
  (8,  'hsa',              'HSA',              false, true, NOW(3)),
  (9,  'ira',              'IRA',              false, true, NOW(3)),
  (10, '401k',             '401(k)',           false, true, NOW(3)),
  (11, 'retirement',       'Retirement Plan',  false, true, NOW(3)),
  (16, 'brokerage',        'Brokerage',        false, true, NOW(3))
ON DUPLICATE KEY UPDATE
  `accrues_balance_growth` = VALUES(`accrues_balance_growth`),
  `updated_at`             = VALUES(`updated_at`);

-- Ensure credit types never accrue growth via this flag
UPDATE `account_type`
SET `accrues_balance_growth` = false, `updated_at` = NOW(3)
WHERE `is_credit` = true AND `accrues_balance_growth` = true;
