/**
 * Pure helper for "today" used by useToday composable.
 * Given an optional test date string (e.g. from runtime config), returns today and YYYY-MM-DD string.
 */
export function parseAsUTC(s: string): Date {
  const trimmed = s.trim();
  if (!trimmed) return new Date();
  const withZ = /Z|[+-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const d = new Date(withZ);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function getTodayFromTestDate(
  testDateStr?: string
): { today: Date; todayISOString: string } {
  const today = testDateStr ? parseAsUTC(testDateStr) : new Date();
  const todayISOString = today.toISOString().substring(0, 10);
  return { today, todayISOString };
}
