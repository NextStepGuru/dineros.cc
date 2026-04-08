import type { Ref } from "vue";

export const CASH_DENOM_CONFIG = [
  { key: "hundreds" as const, face: 100, label: "$100" },
  { key: "fifties" as const, face: 50, label: "$50" },
  { key: "twenties" as const, face: 20, label: "$20" },
  { key: "tens" as const, face: 10, label: "$10" },
  { key: "fives" as const, face: 5, label: "$5" },
  { key: "ones" as const, face: 1, label: "$1" },
] as const;

export type CashDenomKey = (typeof CASH_DENOM_CONFIG)[number]["key"];

export type CashDenomCounts = Record<CashDenomKey, number>;

export const ZERO_CASH_COUNTS: CashDenomCounts = {
  ones: 0,
  fives: 0,
  tens: 0,
  twenties: 0,
  fifties: 0,
  hundreds: 0,
};

export function totalDollarsFromCashCounts(c: CashDenomCounts): number {
  return (
    c.ones * 1 +
    c.fives * 5 +
    c.tens * 10 +
    c.twenties * 20 +
    c.fifties * 50 +
    c.hundreds * 100
  );
}

export function subtotalForCashDenom(
  key: CashDenomKey,
  c: CashDenomCounts,
): number {
  const face = CASH_DENOM_CONFIG.find((d) => d.key === key)?.face ?? 0;
  return c[key] * face;
}

export function bumpCashDenomCount(
  counts: Ref<CashDenomCounts>,
  key: CashDenomKey,
  delta: number,
): void {
  const next = counts.value[key] + delta;
  counts.value[key] = Math.max(0, next);
}
