/**
 * Stable key for matching Plaid transaction names to user-saved aliases.
 * Trim, lowercase, collapse internal whitespace.
 */
export function normalizePlaidDescription(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}
