-- =============================================================================
-- Add Vehicle Asset and Collectable Vehicle account types
-- Add depreciation/appreciation fields to account_register
-- Idempotent: can run multiple times without erroring
-- =============================================================================

-- Add new account types (upsert pattern)
INSERT INTO `account_type` (`id`, `type`, `name`, `is_credit`, `updated_at`)
VALUES
  (20, 'vehicle-asset', 'Vehicle Asset', false, NOW()),
  (21, 'collectable-vehicle', 'Collectable Vehicle', false, NOW())
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`),
  `name` = VALUES(`name`),
  `is_credit` = VALUES(`is_credit`),
  `updated_at` = NOW();

-- Add depreciation/appreciation fields to account_register
-- Check if columns exist before adding (idempotent pattern)
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'account_register'
    AND COLUMN_NAME = 'depreciation_rate'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `account_register`
    ADD COLUMN `depreciation_rate` DECIMAL(7,5) NULL,
    ADD COLUMN `depreciation_method` VARCHAR(30) NULL,
    ADD COLUMN `asset_original_value` DECIMAL(19,2) NULL,
    ADD COLUMN `asset_residual_value` DECIMAL(19,2) NULL,
    ADD COLUMN `asset_useful_life_years` INT NULL,
    ADD COLUMN `asset_start_at` DATETIME(3) NULL',
  'SELECT "Columns already exist, skipping ALTER TABLE" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
