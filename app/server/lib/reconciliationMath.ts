import { roundToCents } from "~/lib/bankers-rounding";

export function reconciliationClearedBalance(
  statementOpeningBalance: number,
  clearedAmountSum: number,
): number {
  return roundToCents(statementOpeningBalance + clearedAmountSum);
}

export function reconciliationDifference(
  statementEndingBalance: number,
  statementOpeningBalance: number,
  clearedAmountSum: number,
): number {
  return roundToCents(
    statementEndingBalance -
      reconciliationClearedBalance(statementOpeningBalance, clearedAmountSum),
  );
}

export function amountsMatch(
  left: number,
  right: number,
  toleranceCents = 1,
): boolean {
  return Math.abs(roundToCents(left) - roundToCents(right)) <= toleranceCents / 100;
}

export function toAmountCents(value: number): number {
  return Math.round(roundToCents(value) * 100);
}
