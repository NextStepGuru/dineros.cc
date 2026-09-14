---
type: Entity
title: migration
description: Warnings:
generated: { by: agent/okf-generator, at: 2026-09-14T06:50:15Z }
---

# migration

Warnings:

## Docstring

Warnings:
- Made the column `statement_interval_id` on table `account_register` required. This step will fail if there are existing NULL values in that column.
