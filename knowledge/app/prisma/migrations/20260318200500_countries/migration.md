---
type: Entity
title: migration
description: Upsert country table (ISO 3166-1: id = numeric, code = alpha-2, code3 = alpha-3).
generated: { by: agent/okf-generator, at: 2026-09-14T06:50:15Z }
---

# migration

Upsert country table (ISO 3166-1: id = numeric, code = alpha-2, code3 = alpha-3).

## Docstring

Upsert country table (ISO 3166-1: id = numeric, code = alpha-2, code3 = alpha-3).
Inserts new rows; on duplicate id, updates name, code, code3, is_active, updated_at.
