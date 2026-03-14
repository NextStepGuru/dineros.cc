import { getTodayFromTestDate } from "~/lib/getTodayFromTestDate";

export function useToday() {
  const config = useRuntimeConfig();
  const testDateStr = config.public.testDate as string | undefined;
  const today = computed(() => {
    if (testDateStr) return getTodayFromTestDate(testDateStr).today;
    return new Date();
  });
  const todayISOString = computed(() =>
    today.value.toISOString().substring(0, 10)
  );
  return { today, todayISOString };
}
