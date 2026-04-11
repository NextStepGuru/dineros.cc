/**
 * Multi-token AND search for table global filters: every whitespace-separated
 * token must appear as a substring somewhere in the combined searchable text.
 */
export function normalizeQuery(raw: string): string {
  return raw.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

export function queryTokens(q: string): string[] {
  return normalizeQuery(q)
    .split(" ")
    .map((t) => t.replaceAll(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

function normalizePart(value: unknown): string {
  if (value == null) return "";
  return String(value).toLowerCase();
}

/**
 * @param query - Raw filter text from the user
 * @param parts - Field values to search (joined with spaces for matching)
 */
export function matchesTableGlobalFilter(
  query: string,
  parts: string[],
): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) return true;

  const tokens = queryTokens(query);
  if (tokens.length === 0) return true;

  const haystack = parts.map(normalizePart).join(" ");
  return tokens.every((t) => haystack.includes(t));
}
