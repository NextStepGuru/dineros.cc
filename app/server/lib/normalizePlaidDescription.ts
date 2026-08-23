import type { Transaction } from "plaid";

/**
 * Stable key for matching Plaid transaction names to user-saved aliases.
 * Trim, lowercase, collapse internal whitespace.
 */
export function normalizePlaidDescription(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, " ")
    .slice(0, 500);
}

const PLAID_NAME_FIELDS = [
  "name",
  "merchant_name",
  "original_description",
] as const;

function pushNormalizedName(set: Set<string>, raw: unknown): void {
  if (typeof raw !== "string") return;
  const normalized = normalizePlaidDescription(raw);
  if (normalized) set.add(normalized);
}

/** Collect unique normalized aliases from Plaid name fields on a transaction or stored JSON. */
export function collectNormalizedPlaidDescriptionAliases(
  source: Transaction | Record<string, unknown> | null | undefined,
): string[] {
  if (!source || typeof source !== "object") return [];
  const set = new Set<string>();
  for (const field of PLAID_NAME_FIELDS) {
    pushNormalizedName(set, (source as Record<string, unknown>)[field]);
  }
  return [...set];
}
