function parseAsUTC(s: string): Date {
  const trimmed = s.trim();
  if (!trimmed) return new Date();
  const withZ = /Z|[+-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const d = new Date(withZ);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function useToday() {
  const config = useRuntimeConfig();
  const testDateStr = config.public.testDate as string | undefined;
  const today = computed(() => {
    if (testDateStr) return parseAsUTC(testDateStr);
    return new Date();
  });
  const todayISOString = computed(() =>
    today.value.toISOString().substring(0, 10)
  );
  return { today, todayISOString };
}
