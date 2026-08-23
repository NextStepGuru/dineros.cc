-- =============================================================================
-- Add Business purpose leaves for every account (Meals, Fuel, Travel, Software)
-- Target: MySQL 8.0+ `category` table
--
-- Safe to repeat. Requires unique index category_account_parent_name_uidx.
-- Paste into a manual Prisma migration (do not auto-run migrate from the agent).
-- =============================================================================

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
    SELECT 'Meals & Entertainment' AS `child_name` UNION ALL
    SELECT 'Fuel' UNION ALL
    SELECT 'Travel' UNION ALL
    SELECT 'Software & Tools'
  ) AS v
  INNER JOIN `category` p
    ON p.`name` = 'Business'
    AND p.`sub_category_id` IS NULL
) AS s
ON DUPLICATE KEY UPDATE
  `is_archived` = false,
  `updated_at` = NOW(3);
