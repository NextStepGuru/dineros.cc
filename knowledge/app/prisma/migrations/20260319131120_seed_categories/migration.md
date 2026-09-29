---
type: Entity
title: migration
description: =============================================================================
generated: { by: agent/okf-generator, at: 2026-09-14T06:50:15Z }
---

# migration

=============================================================================

## Docstring

=============================================================================
Seed common personal-finance categories (parents + subcategories)
Target: MySQL 8.0+ `category` table (Prisma @@map("category"))

Seeds categories for every row in `account`. If there are no accounts, no
rows are inserted (no FK error). Idempotent via ON DUPLICATE KEY UPDATE.

NOTE: `sub_category_id` references the PARENT row (top-level rows use NULL).
=============================================================================

## Relationships

| Type | Target |
|------|--------|
| related | `category_account_parent_name_uidx` |
