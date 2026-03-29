import { userFriendlyApiError } from "~/lib/userFriendlyApiError";
import { formatAccountRegisters } from "~/lib/utils";
import type { CategoryReportResponse } from "~/server/services/reports/types";

export function useCategoryReports() {
  const authStore = useAuthStore();
  const listStore = useListStore();
  const toast = useToast();
  const { todayISOString } = useToday();
  const { workflowMode, defaultReportMode: mode } = useWorkflowMode();
  const dateFrom = ref("");
  const dateTo = ref("");
  /** `all` or register id */
  const accountRegisterScope = ref<number | "all">("all");
  /** User picked "All registers" — don't override when the register list changes. */
  const userChoseAllRegisters = ref(false);
  const includeTransfers = ref(true);
  /** When true, table shows parent + subcategory; when false, amounts roll up to parent. */
  const showSubcategories = ref(true);
  const loading = ref(false);
  const data = ref<CategoryReportResponse | null>(null);
  const errorMessage = ref<string | null>(null);

  const currencyFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencySign: "accounting",
  });

  function initDefaultDates() {
    const start = todayISOString.value;
    dateFrom.value = start;
    const end = new Date(start + "T12:00:00.000Z");
    end.setUTCMonth(end.getUTCMonth() + 1);
    dateTo.value = end.toISOString().slice(0, 10);
  }

  /** First register in UI sort order, or `"all"` if none. */
  function syncRegisterScopeToDefaultOrValid() {
    const sorted = formatAccountRegisters(listStore.getAccountRegisters);
    const first = sorted[0]?.id ?? null;
    if (first == null) {
      accountRegisterScope.value = "all";
      return;
    }
    const cur = accountRegisterScope.value;
    const idInBudget = cur !== "all" && sorted.some((r) => r.id === cur);
    if (cur !== "all" && !idInBudget) {
      accountRegisterScope.value = first;
      return;
    }
    if (cur === "all" && !userChoseAllRegisters.value) {
      accountRegisterScope.value = first;
    }
  }

  async function fetchReport() {
    const budgetId = authStore.getBudgetId;
    errorMessage.value = null;
    if (!budgetId || !dateFrom.value || !dateTo.value) {
      data.value = null;
      return;
    }
    loading.value = true;
    try {
      const $api = useNuxtApp().$api as typeof $fetch;
      const qs = new URLSearchParams({
        budgetId: String(budgetId),
        mode: mode.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        includeTransfers: includeTransfers.value ? "true" : "false",
        showSubcategories: showSubcategories.value ? "true" : "false",
      });
      if (accountRegisterScope.value !== "all") {
        qs.set("accountRegisterId", String(accountRegisterScope.value));
      }
      data.value = await $api<CategoryReportResponse>(
        `/api/reports/categories?${qs.toString()}`,
      );
    } catch (e: unknown) {
      data.value = null;
      const msg = userFriendlyApiError(
        e,
        "We couldn’t load this report. Please try again.",
      );
      errorMessage.value = msg;
      toast.add({
        color: "error",
        description: msg,
      });
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    initDefaultDates();
  });

  watch(accountRegisterScope, (v) => {
    userChoseAllRegisters.value = v === "all";
  });

  watch(
    () =>
      `${authStore.getBudgetId}:${listStore.getAccountRegisters.map((r) => r.id).join(",")}`,
    (newKey, oldKey) => {
      if (oldKey != null) {
        const ni = newKey.indexOf(":");
        const oi = oldKey.indexOf(":");
        if (ni > 0 && oi > 0 && newKey.slice(0, ni) !== oldKey.slice(0, oi)) {
          userChoseAllRegisters.value = false;
        }
      }
      syncRegisterScopeToDefaultOrValid();
    },
    { flush: "post", immediate: true },
  );

  watch(
    todayISOString,
    () => {
      if (!dateFrom.value || !dateTo.value) initDefaultDates();
    },
    { flush: "post" },
  );

  watch(
    [
      () => workflowMode.value,
      dateFrom,
      dateTo,
      accountRegisterScope,
      includeTransfers,
      showSubcategories,
      () => authStore.getBudgetId,
    ],
    () => {
      if (!import.meta.client) return;
      if (!dateFrom.value || !dateTo.value) return;
      if (!authStore.getBudgetId) {
        data.value = null;
        return;
      }
      void fetchReport();
    },
    { deep: true, flush: "post" },
  );

  return {
    mode,
    dateFrom,
    dateTo,
    accountRegisterScope,
    includeTransfers,
    showSubcategories,
    loading,
    data,
    errorMessage,
    currencyFmt,
    initDefaultDates,
    fetchReport,
  };
}
