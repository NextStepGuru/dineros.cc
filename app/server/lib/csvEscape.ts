/** Escape a string for CSV (RFC-style quoting when needed). */
export function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
