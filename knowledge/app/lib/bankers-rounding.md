---
type: Entity
title: bankers-rounding
description: Bankers Rounding Utility for Financial Calculations
generated: { by: agent/okf-generator, at: 2026-09-14T06:50:14Z }
---

# bankers-rounding

Bankers Rounding Utility for Financial Calculations

## Docstring

Bankers Rounding Utility for Financial Calculations
This module provides utilities for performing all monetary calculations
using bankers rounding (round half to even) with fixed 2 decimal precision.
All monetary values in the system should use this utility to ensure
consistent and accurate financial calculations.

## Relationships

| Type | Target |
|------|--------|
| related | MonetaryValue |
| related | roundToCents |
| related | toMonetaryDecimal |
| related | addMoney |
| related | subtractMoney |
| related | multiplyMoney |
| related | divideMoney |
| related | calculatePercentage |
| related | calculateCompoundInterest |
| related | calculateSimpleInterest |
| related | formatMoney |
| related | formatMoneyUsd |
| related | isValidMonetaryValue |
| related | normalizeMonetaryValue |
| related | isMonetaryEqual |
| related | absoluteMoney |
| related | maxMoney |
| related | minMoney |
| related | sumMoney |
| related | bankers-rounding |
| related | @prisma/client |
