<script setup lang="ts">
import { formatMoneyUsd } from "~/lib/bankers-rounding";
import { buildSortedCategorySelectItems } from "~/lib/categorySelect";

definePageMeta({
  middleware: "auth",
});
useHead({ title: "Reconciliation | Dineros" });

type WorkspaceItem = {
  id: number;
  registerEntryId: string;
  isCleared: boolean;
  note: string | null;
  entry: {
    id: string;
    createdAt: string;
    description: string;
    amount: number;
    balance: number;
    isCleared: boolean;
    isReconciled: boolean;
    isProjected?: boolean;
    isPending?: boolean;
    categoryId: string | null;
  };
};

type WorkspaceLine = {
  id: number;
  postedAt: string;
  description: string;
  amount: number;
  lineType: string | null;
  matchStatus: string;
  registerEntryId: string | null;
  matchConfidence: number | null;
  matchReason: string | null;
  ignoredAt: string | null;
};

type ReconciliationWorkspace = {
  period: {
    id: number;
    status: "OPEN" | "CLOSED";
    accountRegisterId: number;
    startDate: string;
    endDate: string;
    statementOpeningBalance: number;
    statementEndingBalance: number;
    statementIncomeTotal: number | null;
    statementExpenseTotal: number | null;
    ledgerClearedBalance: number;
    clearedAmountSum: number;
    differenceAmount: number;
    closeNote: string | null;
    register: { id: number; name: string };
  };
  items: WorkspaceItem[];
  statementLines: WorkspaceLine[];
  buckets: {
    matched: Array<{ line: WorkspaceLine; item: WorkspaceItem | null }>;
    statementOnly: WorkspaceLine[];
    ledgerOnly: Array<{
      item: WorkspaceItem;
      hint:
        | "next_statement"
        | "projected"
        | "transfer"
        | "pending"
        | "missing_from_statement";
    }>;
    conflicts: Array<{ line: WorkspaceLine; item: WorkspaceItem | null }>;
    ignored: WorkspaceLine[];
  };
  discrepancyHints: {
    hasDifference: boolean;
    nearMatchEntryId: string | null;
    possibleSignMismatchCount: number;
    possibleWrongSignEntryId: string | null;
    incomeSubtotalDelta: number | null;
    expenseSubtotalDelta: number | null;
  };
  openingContinuity: {
    previousEnding: number;
    expectedOpening: number;
    matches: boolean;
  } | null;
};

type ExtractedStatement = {
  startDate: string | null;
  endDate: string | null;
  openingBalance: number | null;
  endingBalance: number | null;
  incomeTotal: number | null;
  expenseTotal: number | null;
  lines: Array<{
    date: string;
    description: string;
    amount: number;
    lineType: string | null;
  }>;
  controlOk: boolean;
  controlExpectedEnding: number | null;
  source: string;
  warnings: string[];
};

const route = useRoute();
const authStore = useAuthStore();
const listStore = useListStore();
const { setWorkflowMode } = useWorkflowMode();
const toast = useToast();
const { $api } = useNuxtApp();

const loading = ref(false);
const extractLoading = ref(false);
const extractStatus = ref<string | null>(null);
const extractElapsedSec = ref(0);
const selectedStatementFileName = ref<string | null>(null);
let extractElapsedTimer: ReturnType<typeof setInterval> | null = null;
let extractSlowHintTimer: ReturnType<typeof setTimeout> | null = null;
const actionLoading = ref<Set<string>>(new Set());
const periodId = ref<number | null>(null);
const workspace = ref<ReconciliationWorkspace | null>(null);
const closeNote = ref("");
const matchedOpen = ref(false);
const lastClosedEnding = ref<number | null>(null);
const extracted = ref<ExtractedStatement | null>(null);
const fileInput = ref<{ inputRef?: HTMLInputElement | null } | null>(null);

const openForm = reactive({
  startDate: "",
  endDate: "",
  statementOpeningBalance: 0,
  statementEndingBalance: 0,
});

const balanceForm = reactive({
  statementOpeningBalance: 0,
  statementEndingBalance: 0,
});

const accountRegisterId = computed(() =>
  Number.parseInt(String(route.params.accountRegisterId || 0), 10),
);

const accountName = computed(
  () =>
    listStore.getAccountRegisters.find((r) => r.id === accountRegisterId.value)
      ?.name ?? "Register",
);

const accountIdForCategories = computed(
  () =>
    listStore.getAccountRegisters.find((r) => r.id === accountRegisterId.value)
      ?.accountId ?? null,
);

const categorySelectItems = computed(() =>
  buildSortedCategorySelectItems(
    listStore.getCategories,
    accountIdForCategories.value,
  ),
);

const formatMoney = (amount: number) => formatMoneyUsd(amount);

const hasStatementLines = computed(
  () => (workspace.value?.statementLines.length ?? 0) > 0,
);
const clearedCount = computed(
  () => workspace.value?.items.filter((i) => i.isCleared).length ?? 0,
);
const totalCount = computed(() => workspace.value?.items.length ?? 0);
const progressPercent = computed(() =>
  totalCount.value > 0
    ? Math.round((clearedCount.value / totalCount.value) * 100)
    : 0,
);
const differenceIsZero = computed(
  () =>
    workspace.value != null &&
    Math.abs(workspace.value.period.differenceAmount) < 0.01,
);

const closeGap = computed(() => {
  const w = workspace.value;
  if (!w) {
    return {
      dollars: 0,
      statementOnly: 0,
      ledgerOnly: 0,
      conflicts: 0,
      uncleared: 0,
      unresolvedEntries: 0,
      uncategorizedCleared: 0,
    };
  }
  const statementOnly = w.buckets.statementOnly.length;
  const ledgerOnly = w.buckets.ledgerOnly.filter((row) => !row.item.isCleared)
    .length;
  const conflicts = w.buckets.conflicts.length;
  const uncleared = w.items.filter((item) => !item.isCleared).length;
  const uncategorizedCleared = w.items.filter(
    (item) => item.isCleared && !item.entry.categoryId,
  ).length;
  return {
    dollars: w.period.differenceAmount,
    statementOnly,
    ledgerOnly,
    conflicts,
    uncleared,
    unresolvedEntries: statementOnly + ledgerOnly + conflicts,
    uncategorizedCleared,
  };
});

const uncategorizedClearedItems = computed(
  () =>
    (workspace.value?.items ?? []).filter(
      (item) => item.isCleared && !item.entry.categoryId,
    ),
);

const canClosePeriod = computed(
  () =>
    differenceIsZero.value &&
    closeGap.value.statementOnly === 0 &&
    closeGap.value.uncategorizedCleared === 0,
);

const periodIsOpen = computed(
  () => workspace.value?.period.status === "OPEN",
);

const balancesDirty = computed(() => {
  const period = workspace.value?.period;
  if (!period) return false;
  return (
    Math.round(balanceForm.statementOpeningBalance * 100) !==
      Math.round(period.statementOpeningBalance * 100) ||
    Math.round(balanceForm.statementEndingBalance * 100) !==
      Math.round(period.statementEndingBalance * 100)
  );
});

function entryCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const unclearedMatchOptions = computed(() =>
  (workspace.value?.items ?? [])
    .filter((item) => !item.isCleared)
    .map((item) => ({
      label: `${new Date(item.entry.createdAt).toLocaleDateString()} ${item.entry.description} ${formatMoney(item.entry.amount)}`,
      value: item.registerEntryId,
    })),
);

const hintLabel: Record<
  NonNullable<
    ReconciliationWorkspace["buckets"]["ledgerOnly"][number]["hint"]
  >,
  string
> = {
  next_statement: "Next statement",
  projected: "Projected",
  transfer: "Transfer",
  pending: "Pending",
  missing_from_statement: "Not on statement",
};

async function loadOpenPeriod() {
  if (!authStore.getBudgetId || !accountRegisterId.value) return;
  const setup = await ($api as typeof $fetch)<{
    open: { id: number } | null;
    lastClosed: { statementEndingBalance: number } | null;
  }>("/api/reconciliation/period", {
    query: {
      budgetId: authStore.getBudgetId,
      accountRegisterId: accountRegisterId.value,
    },
  });
  periodId.value = setup.open?.id ?? null;
  lastClosedEnding.value = setup.lastClosed?.statementEndingBalance ?? null;
  if (
    lastClosedEnding.value != null &&
    openForm.statementOpeningBalance === 0
  ) {
    openForm.statementOpeningBalance = lastClosedEnding.value;
  }
}

async function loadWorkspace() {
  if (!periodId.value) {
    workspace.value = null;
    return;
  }
  loading.value = true;
  try {
    workspace.value = await ($api as typeof $fetch)<ReconciliationWorkspace>(
      `/api/reconciliation/period/${periodId.value}`,
    );
    balanceForm.statementOpeningBalance =
      workspace.value.period.statementOpeningBalance;
    balanceForm.statementEndingBalance =
      workspace.value.period.statementEndingBalance;
  } catch {
    toast.add({
      color: "error",
      description: "Failed to load reconciliation workspace.",
    });
  } finally {
    loading.value = false;
  }
}

function clearExtractTimers() {
  if (extractElapsedTimer) {
    clearInterval(extractElapsedTimer);
    extractElapsedTimer = null;
  }
  if (extractSlowHintTimer) {
    clearTimeout(extractSlowHintTimer);
    extractSlowHintTimer = null;
  }
}

function onStatementFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedStatementFileName.value = input.files?.[0]?.name ?? null;
}

function beginExtractProgress() {
  clearExtractTimers();
  extractElapsedSec.value = 0;
  extractStatus.value = "Reading your statement…";
  extractElapsedTimer = setInterval(() => {
    extractElapsedSec.value += 1;
  }, 1000);
  extractSlowHintTimer = setTimeout(() => {
    if (extractLoading.value) {
      extractStatus.value =
        "Analyzing statement… some PDFs take 1–2 minutes.";
    }
  }, 4000);
}

async function extractStatement() {
  const el = fileInput.value?.inputRef;
  const file = el?.files?.[0];
  if (!file) {
    toast.add({
      title: "No file selected",
      color: "error",
      description: "Choose a PDF, CSV, or OFX statement first.",
    });
    return;
  }
  extractLoading.value = true;
  beginExtractProgress();
  try {
    const body = new FormData();
    body.append("file", file);
    body.append("accountRegisterId", String(accountRegisterId.value));
    const result = await ($api as typeof $fetch)<ExtractedStatement>(
      "/api/reconciliation/statement/extract",
      { method: "POST", body },
    );
    extracted.value = result;
    if (result.startDate) openForm.startDate = result.startDate;
    if (result.endDate) openForm.endDate = result.endDate;
    if (result.openingBalance != null) {
      openForm.statementOpeningBalance = result.openingBalance;
    }
    if (result.endingBalance != null) {
      openForm.statementEndingBalance = result.endingBalance;
    }
    toast.add({
      title: result.controlOk ? "Statement extracted" : "Review extracted totals",
      color: result.controlOk ? "success" : "warning",
      description: result.controlOk
        ? `${result.lines.length} lines from ${result.source} in ${extractElapsedSec.value}s.`
        : `${result.lines.length} lines from ${result.source}. Check balances before opening.`,
    });
  } catch (error: unknown) {
    const err = error as {
      data?: { message?: string };
      statusMessage?: string;
    };
    toast.add({
      title: "Extract failed",
      color: "error",
      description:
        err?.data?.message ??
        err?.statusMessage ??
        "Could not read that statement. Try CSV/OFX if the PDF has no text.",
    });
  } finally {
    extractLoading.value = false;
    extractStatus.value = null;
    clearExtractTimers();
  }
}

async function openPeriod() {
  if (!authStore.getBudgetId || !accountRegisterId.value) return;
  try {
    const created = await ($api as typeof $fetch)<{ id: number }>(
      "/api/reconciliation/period",
      {
        method: "POST",
        body: {
          budgetId: authStore.getBudgetId,
          accountRegisterId: accountRegisterId.value,
          startDate: openForm.startDate,
          endDate: openForm.endDate,
          statementOpeningBalance: openForm.statementOpeningBalance,
          statementEndingBalance: openForm.statementEndingBalance,
          statementIncomeTotal: extracted.value?.incomeTotal ?? null,
          statementExpenseTotal: extracted.value?.expenseTotal ?? null,
          statementLines: extracted.value?.lines,
        },
      },
    );
    periodId.value = created.id;
    toast.add({
      color: "success",
      description: "Reconciliation period opened.",
    });
    await loadWorkspace();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to open reconciliation period.",
    });
  }
}

async function toggleCleared(item: WorkspaceItem) {
  actionLoading.value.add(item.registerEntryId);
  try {
    await ($api as typeof $fetch)(
      `/api/reconciliation/item/${item.registerEntryId}`,
      {
        method: "PATCH",
        body: { isCleared: !item.isCleared },
      },
    );
    await loadWorkspace();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to update cleared state.",
    });
  } finally {
    actionLoading.value.delete(item.registerEntryId);
  }
}

function categoryIdFromSelect(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value: unknown }).value;
    if (typeof inner === "string" && inner) return inner;
  }
  return null;
}

async function setItemCategory(item: WorkspaceItem, value: unknown) {
  const categoryId = categoryIdFromSelect(value);
  if (!categoryId) return;
  actionLoading.value.add(`cat-${item.registerEntryId}`);
  try {
    await ($api as typeof $fetch)(
      `/api/reconciliation/item/${item.registerEntryId}`,
      {
        method: "PATCH",
        body: { categoryId },
      },
    );
    await loadWorkspace();
  } catch (error: unknown) {
    const err = error as {
      data?: { message?: string };
      statusMessage?: string;
    };
    toast.add({
      color: "error",
      description:
        err?.data?.message ??
        err?.statusMessage ??
        "Could not set category.",
    });
  } finally {
    actionLoading.value.delete(`cat-${item.registerEntryId}`);
  }
}

async function ignoreLine(lineId: number, ignore: boolean) {
  actionLoading.value.add(`line-${lineId}`);
  try {
    await ($api as typeof $fetch)(`/api/reconciliation/statement-line/${lineId}`, {
      method: "PATCH",
      body: { ignore },
    });
    await loadWorkspace();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to update statement line.",
    });
  } finally {
    actionLoading.value.delete(`line-${lineId}`);
  }
}

function onMatchSelect(lineId: number, value: unknown) {
  if (typeof value === "string" && value) {
    void matchLine(lineId, value);
    return;
  }
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value: unknown }).value;
    if (typeof inner === "string" && inner) {
      void matchLine(lineId, inner);
    }
  }
}

async function addLineToLedger(lineId: number) {
  actionLoading.value.add(`line-${lineId}`);
  try {
    await ($api as typeof $fetch)(`/api/reconciliation/statement-line/${lineId}`, {
      method: "PATCH",
      body: { createLedgerEntry: true },
    });
    toast.add({
      color: "success",
      description: "Added to the ledger and marked cleared.",
    });
    await loadWorkspace();
  } catch (error: unknown) {
    const err = error as {
      data?: { message?: string };
      statusMessage?: string;
    };
    toast.add({
      color: "error",
      description:
        err?.data?.message ??
        err?.statusMessage ??
        "Could not add that statement line to the ledger.",
    });
  } finally {
    actionLoading.value.delete(`line-${lineId}`);
  }
}

async function addAllStatementOnlyToLedger() {
  if (!periodId.value) return;
  const count = workspace.value?.buckets.statementOnly.length ?? 0;
  if (!count) return;
  actionLoading.value.add("add-all-lines");
  try {
    const result = await ($api as typeof $fetch)<{ created: number }>(
      `/api/reconciliation/period/${periodId.value}/import-statement-lines`,
      { method: "POST", body: {} },
    );
    toast.add({
      color: "success",
      description: `Added ${result.created} ${result.created === 1 ? "entry" : "entries"} to the ledger.`,
    });
    await loadWorkspace();
  } catch (error: unknown) {
    const err = error as {
      data?: { message?: string };
      statusMessage?: string;
    };
    toast.add({
      color: "error",
      description:
        err?.data?.message ??
        err?.statusMessage ??
        "Could not add unmatched statement lines to the ledger.",
    });
  } finally {
    actionLoading.value.delete("add-all-lines");
  }
}

async function matchLine(lineId: number, registerEntryId: string | null) {
  actionLoading.value.add(`line-${lineId}`);
  try {
    await ($api as typeof $fetch)(`/api/reconciliation/statement-line/${lineId}`, {
      method: "PATCH",
      body: { registerEntryId },
    });
    await loadWorkspace();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to match statement line.",
    });
  } finally {
    actionLoading.value.delete(`line-${lineId}`);
  }
}

async function saveBalances() {
  if (!periodId.value || !periodIsOpen.value || !balancesDirty.value) return;
  actionLoading.value.add("balances");
  try {
    workspace.value = await ($api as typeof $fetch)<ReconciliationWorkspace>(
      `/api/reconciliation/period/${periodId.value}`,
      {
        method: "PATCH",
        body: {
          statementOpeningBalance: balanceForm.statementOpeningBalance,
          statementEndingBalance: balanceForm.statementEndingBalance,
        },
      },
    );
    balanceForm.statementOpeningBalance =
      workspace.value.period.statementOpeningBalance;
    balanceForm.statementEndingBalance =
      workspace.value.period.statementEndingBalance;
    toast.add({
      color: "success",
      description: "Opening and ending balances updated.",
    });
  } catch (error: unknown) {
    const err = error as {
      data?: { message?: string };
      statusMessage?: string;
    };
    toast.add({
      color: "error",
      description:
        err?.data?.message ??
        err?.statusMessage ??
        "Failed to update opening and ending balances.",
    });
  } finally {
    actionLoading.value.delete("balances");
  }
}

async function rematch() {
  if (!periodId.value) return;
  actionLoading.value.add("rematch");
  try {
    const result = await ($api as typeof $fetch)<{
      matched: number;
      conflicts: number;
      statementOnly: number;
    }>(`/api/reconciliation/period/${periodId.value}/match`, {
      method: "POST",
    });
    toast.add({
      color: "success",
      description: `Matched ${result.matched}. ${result.statementOnly} still only on the statement.`,
    });
    await loadWorkspace();
  } catch {
    toast.add({
      color: "error",
      description: "Failed to rematch statement lines.",
    });
  } finally {
    actionLoading.value.delete("rematch");
  }
}

async function closePeriod() {
  if (!periodId.value) return;
  actionLoading.value.add("close");
  try {
    await ($api as typeof $fetch)(
      `/api/reconciliation/period/${periodId.value}/close`,
      {
        method: "POST",
        body: {
          closeNote: closeNote.value || null,
        },
      },
    );
    toast.add({
      color: "success",
      description: "Reconciliation period closed.",
    });
    periodId.value = null;
    workspace.value = null;
    extracted.value = null;
    await loadOpenPeriod();
    await loadWorkspace();
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; statusMessage?: string };
    toast.add({
      color: "error",
      description:
        err?.data?.message ??
        err?.statusMessage ??
        "Unable to close period. Dollars must match and every cleared entry needs a category.",
    });
  } finally {
    actionLoading.value.delete("close");
  }
}

function initDefaultDates() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  openForm.startDate = start.toISOString().slice(0, 10);
  openForm.endDate = end.toISOString().slice(0, 10);
}

initDefaultDates();

watch(
  [() => authStore.getBudgetId, accountRegisterId],
  async () => {
    if (!import.meta.client) return;
    try {
      await loadOpenPeriod();
      await loadWorkspace();
    } catch (error: unknown) {
      const err = error as {
        data?: { message?: string };
        statusMessage?: string;
      };
      toast.add({
        title: "Could not load reconciliation",
        description:
          err?.data?.message ??
          err?.statusMessage ??
          "Sign in again or retry from the hub.",
        color: "error",
      });
    }
  },
  { immediate: true },
);

onMounted(() => {
  setWorkflowMode("reconciliation");
});

onBeforeUnmount(() => {
  clearExtractTimers();
});
</script>

<template lang="pug">
section(class="px-3 sm:px-4 py-4 max-w-6xl mx-auto space-y-4")
  UAlert(
    color="neutral"
    variant="subtle"
    title="Statement reconciliation"
  )
    template(#description)
      span.frog-text-muted You are in the Reconciliation workflow — comparing the ledger to bank statement balances, not editing projections.
  .flex.flex-wrap.items-center.justify-between.gap-2
    div
      h1(class="text-xl font-semibold") {{ accountName }}
      p(class="text-sm frog-text-muted") Reconciliation workspace
    .flex.items-center.gap-2
      UButton(variant="soft" to="/reconciliation") All accounts
      UButton(variant="soft" :to="`/register/${accountRegisterId}`") Back to register

  template(v-if="!periodId")
    UCard
      template(#header)
        .flex.items-center.gap-2
          UIcon(name="i-lucide-folder-open" class="text-primary")
          h2(class="font-semibold") Open a statement period
      p(class="text-sm frog-text-muted mb-4") Upload a statement or enter dates and balances to begin reconciling.
      .flex.flex-col.gap-3.mb-4(class="sm:flex-row sm:items-end")
        UFormField(label="Statement file" class="flex-1")
          UInput(
            ref="fileInput"
            type="file"
            accept=".pdf,.csv,.ofx,.qfx,.txt"
            :disabled="extractLoading"
            class="w-full"
            @change="onStatementFileChange")
          p(
            v-if="selectedStatementFileName"
            class="text-xs frog-text-muted mt-1 truncate"
          ) {{ selectedStatementFileName }}
        UButton(
          color="primary"
          variant="soft"
          icon="i-lucide-upload"
          :loading="extractLoading"
          :disabled="extractLoading || !selectedStatementFileName"
          @click="extractStatement") {{ extractLoading ? "Extracting…" : "Extract" }}
      UAlert(
        v-if="extractLoading"
        color="info"
        variant="subtle"
        class="mb-4"
        icon="i-lucide-loader-circle"
        title="Extracting statement"
      )
        template(#description)
          p {{ extractStatus }}
          p(class="text-xs frog-text-muted mt-1") {{ extractElapsedSec }}s elapsed — leave this tab open.
      UAlert(
        v-if="extracted"
        :color="extracted.controlOk ? 'success' : 'warning'"
        variant="subtle"
        class="mb-4"
        :title="extracted.controlOk ? 'Control totals match' : 'Check extracted totals'"
      )
        template(#description)
          span {{ extracted.lines.length }} lines from {{ extracted.source }}.
          span(v-if="extracted.controlExpectedEnding != null")
            |  Expected ending {{ formatMoney(extracted.controlExpectedEnding) }}.
          span(v-for="warning in extracted.warnings" :key="warning")
            |  {{ warning }}
      UAlert(
        v-if="lastClosedEnding != null"
        color="neutral"
        variant="subtle"
        class="mb-4"
        title="Opening continuity"
        :description="`Last closed period ended at ${formatMoney(lastClosedEnding)}.`")
      div(class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4")
        UFormField(label="Start date")
          UInput(v-model="openForm.startDate" type="date")
        UFormField(label="End date")
          UInput(v-model="openForm.endDate" type="date")
        UFormField(label="Opening balance")
          UInputNumber(v-model="openForm.statementOpeningBalance" :step="0.01")
        UFormField(label="Ending balance")
          UInputNumber(v-model="openForm.statementEndingBalance" :step="0.01")
      .mt-4
        UButton(
          color="primary"
          icon="i-lucide-play"
          :disabled="extractLoading"
          @click="openPeriod") Open period

  template(v-else-if="workspace")
    UCard
      .flex.flex-wrap.items-start.justify-between.gap-4
        div(class="space-y-1")
          h2(class="font-semibold text-lg")
            | {{ new Date(workspace.period.startDate).toLocaleDateString() }} – {{ new Date(workspace.period.endDate).toLocaleDateString() }}
          div(class="flex flex-wrap items-end gap-3 mt-3")
            UFormField(label="Opening balance")
              UInputNumber(
                v-model="balanceForm.statementOpeningBalance"
                :step="0.01"
                :disabled="!periodIsOpen || actionLoading.has('balances')")
            UFormField(label="Ending balance")
              UInputNumber(
                v-model="balanceForm.statementEndingBalance"
                :step="0.01"
                :disabled="!periodIsOpen || actionLoading.has('balances')")
            UButton(
              v-if="periodIsOpen"
              size="sm"
              color="primary"
              icon="i-lucide-save"
              :loading="actionLoading.has('balances')"
              :disabled="!balancesDirty || actionLoading.has('balances')"
              @click="saveBalances") Save balances
          div(class="flex flex-wrap gap-x-6 gap-y-1 text-sm")
            span
              span(class="frog-text-muted") Cleared net:&nbsp;
              span(class="font-medium") {{ formatMoney(workspace.period.clearedAmountSum) }}
            span
              span(class="frog-text-muted") Opening + cleared:&nbsp;
              span(class="font-medium") {{ formatMoney(workspace.period.ledgerClearedBalance) }}
        .text-right.space-y-1
          UBadge(
            :color="differenceIsZero ? 'success' : 'error'"
            variant="solid"
            size="lg")
            | Difference: {{ formatMoney(workspace.period.differenceAmount) }}
          p(class="text-xs frog-text-muted")
            | {{ clearedCount }} of {{ totalCount }} cleared ({{ progressPercent }}%)
          UButton(
            v-if="hasStatementLines"
            size="xs"
            variant="soft"
            icon="i-lucide-sparkles"
            :loading="actionLoading.has('rematch')"
            @click="rematch") Re-run match

    .h-1.rounded-full.bg-elevated.overflow-hidden(v-if="totalCount > 0")
      div(
        class="h-full rounded-full transition-all duration-300"
        :class="differenceIsZero ? 'bg-success' : 'bg-primary'"
        :style="{ width: progressPercent + '%' }")

    UAlert(
      v-if="workspace.openingContinuity && !workspace.openingContinuity.matches"
      color="warning"
      variant="subtle"
      icon="i-lucide-info"
      title="Opening balance does not match the last closed ending"
      :description="`Last closed ending was ${formatMoney(workspace.openingContinuity.previousEnding)}.`")

    UAlert(
      v-if="workspace.discrepancyHints.hasDifference && !differenceIsZero"
      color="warning"
      variant="subtle"
      icon="i-lucide-info"
      title="Difference detected")
      template(#description)
        span {{ workspace.discrepancyHints.possibleSignMismatchCount }} uncleared entries could affect the balance.
        span(v-if="workspace.discrepancyHints.nearMatchEntryId")
          |  A near-match entry was found.
        span(v-if="workspace.discrepancyHints.possibleWrongSignEntryId")
          |  One amount is about half the difference (possible wrong sign).
        span(
          v-if="workspace.discrepancyHints.incomeSubtotalDelta != null && Math.abs(workspace.discrepancyHints.incomeSubtotalDelta) > 0.009")
          |  Income subtotal is off by {{ formatMoney(workspace.discrepancyHints.incomeSubtotalDelta) }}.
        span(
          v-if="workspace.discrepancyHints.expenseSubtotalDelta != null && Math.abs(workspace.discrepancyHints.expenseSubtotalDelta) > 0.009")
          |  Expense subtotal is off by {{ formatMoney(workspace.discrepancyHints.expenseSubtotalDelta) }}.

    template(v-if="hasStatementLines")
      UCard(:ui="{ root: 'overflow-visible' }")
        template(#header)
          .flex.flex-wrap.items-center.justify-between.gap-2
            .flex.items-center.gap-2
              h3(class="font-semibold") On statement, not in ledger
              UBadge(variant="subtle") {{ workspace.buckets.statementOnly.length }}
            UButton(
              v-if="workspace.buckets.statementOnly.length"
              size="xs"
              color="primary"
              variant="soft"
              icon="i-lucide-plus"
              :loading="actionLoading.has('add-all-lines')"
              :disabled="actionLoading.has('add-all-lines')"
              @click="addAllStatementOnlyToLedger") Add all unmatched
        p(
          v-if="!workspace.buckets.statementOnly.length"
          class="text-sm frog-text-muted") No unmatched statement lines.
        template(v-else)
          p(class="text-sm frog-text-muted mb-3") Match to an existing row, add a new ledger entry, or ignore for this period.
          .space-y-3
            .flex.flex-col.gap-2.border-b.pb-3(
              v-for="line in workspace.buckets.statementOnly"
              :key="line.id")
              .flex.flex-wrap.items-baseline.justify-between.gap-2
                span {{ new Date(line.postedAt).toLocaleDateString() }} · {{ line.description }}
                span(class="font-mono" :class="line.amount < 0 ? 'money-negative' : 'money-positive'") {{ formatMoney(line.amount) }}
              .flex.flex-col.gap-2(class="sm:flex-row sm:items-center")
                USelectMenu(
                  :items="unclearedMatchOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="Match to ledger…"
                  search-placeholder="Search ledger…"
                  class="w-full sm:min-w-72 sm:max-w-xl"
                  :ui="{ content: 'z-[100] max-h-60' }"
                  :content="{ position: 'popper', side: 'bottom', sideOffset: 8, collisionPadding: 16 }"
                  @update:model-value="(v) => onMatchSelect(line.id, v)")
                .flex.flex-wrap.gap-2.shrink-0
                  UButton(
                    size="xs"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-plus"
                    :loading="actionLoading.has(`line-${line.id}`)"
                    :disabled="actionLoading.has('add-all-lines')"
                    @click="addLineToLedger(line.id)") Add to ledger
                  UButton(
                    size="xs"
                    variant="soft"
                    :loading="actionLoading.has(`line-${line.id}`)"
                    :disabled="actionLoading.has('add-all-lines')"
                    @click="ignoreLine(line.id, true)") Ignore this period

      UCard
        template(#header)
          .flex.items-center.justify-between
            h3(class="font-semibold") In ledger, not on statement
            UBadge(variant="subtle") {{ workspace.buckets.ledgerOnly.length }}
        p(
          v-if="!workspace.buckets.ledgerOnly.length"
          class="text-sm frog-text-muted") Every uncleared ledger row is matched or cleared.
        .overflow-x-auto(v-else)
          table(class="w-full text-sm")
            tbody
              tr.border-b(v-for="row in workspace.buckets.ledgerOnly" :key="row.item.registerEntryId")
                td.p-2
                  UCheckbox(
                    :model-value="row.item.isCleared"
                    :disabled="actionLoading.has(row.item.registerEntryId) || row.item.entry.isReconciled"
                    @update:model-value="toggleCleared(row.item)")
                td.p-2 {{ new Date(row.item.entry.createdAt).toLocaleDateString() }}
                td.p-2 {{ row.item.entry.description }}
                td.p-2.text-right.font-mono(
                  :class="row.item.entry.amount < 0 ? 'money-negative' : 'money-positive'") {{ formatMoney(row.item.entry.amount) }}
                td.p-2.text-right
                  UBadge(variant="subtle" size="xs") {{ hintLabel[row.hint] }}

      UCard(v-if="workspace.buckets.conflicts.length")
        template(#header)
          .flex.items-center.justify-between
            h3(class="font-semibold") Conflicts
            UBadge(color="warning" variant="subtle") {{ workspace.buckets.conflicts.length }}
        .space-y-3
          .border-b.pb-3(v-for="row in workspace.buckets.conflicts" :key="row.line.id")
            p {{ new Date(row.line.postedAt).toLocaleDateString() }} · {{ row.line.description }}
              span.font-mono.ml-2(:class="row.line.amount < 0 ? 'money-negative' : 'money-positive'") {{ formatMoney(row.line.amount) }}
            p.text-sm.frog-text-muted(v-if="row.line.matchReason") {{ row.line.matchReason }}
            .flex.flex-wrap.gap-2.mt-2
              UButton(
                size="xs"
                variant="soft"
                @click="ignoreLine(row.line.id, true)") Ignore
              UButton(
                v-if="row.item"
                size="xs"
                variant="soft"
                @click="matchLine(row.line.id, row.item.registerEntryId)") Accept match
              UButton(
                size="xs"
                variant="ghost"
                @click="matchLine(row.line.id, null)") Unmatch

      UCard
        template(#header)
          button.flex.items-center.justify-between.w-full(
            type="button"
            @click="matchedOpen = !matchedOpen")
            .flex.items-center.gap-2
              h3(class="font-semibold") Matched
              UBadge(color="success" variant="subtle") {{ workspace.buckets.matched.length }}
            UIcon(:name="matchedOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'")
        .overflow-x-auto(v-if="matchedOpen")
          table(class="w-full text-sm")
            tbody
              tr.border-b.row-cleared-hint(
                v-for="row in workspace.buckets.matched"
                :key="row.line.id")
                td.p-2 {{ new Date(row.line.postedAt).toLocaleDateString() }}
                td.p-2 {{ row.line.description }}
                td.p-2.text-right.font-mono(
                  :class="row.line.amount < 0 ? 'money-negative' : 'money-positive'") {{ formatMoney(row.line.amount) }}
                td.p-2.text-right
                  UButton(
                    size="xs"
                    variant="ghost"
                    @click="matchLine(row.line.id, null)") Undo

    UCard(v-else)
      template(#header)
        .flex.items-center.justify-between
          .flex.items-center.gap-2
            UIcon(name="i-lucide-list-checks")
            h3(class="font-semibold") Transactions
          .flex.items-center.gap-3.text-sm
            span.frog-text-muted {{ workspace.items.filter((i) => !i.isCleared).length }} uncleared
            span(class="frog-status-positive font-medium") {{ clearedCount }} cleared
      div(class="overflow-x-auto")
        table(class="w-full text-sm")
          thead
            tr(class="border-b sticky top-0 bg-elevated z-10")
              th(class="text-center p-2 w-12")
                UIcon(name="i-lucide-circle-check" class="frog-text-muted" size="16")
              th(class="text-left p-2") Date
              th(class="text-left p-2") Description
              th(class="text-right p-2") Amount
              th(class="text-right p-2") Status
          tbody
            tr(
              v-for="item in workspace.items"
              :key="item.registerEntryId"
              class="border-b transition-colors"
              :class="item.isCleared ? 'row-cleared-hint' : ''")
              td(class="p-2 text-center")
                UCheckbox(
                  :model-value="item.isCleared"
                  :disabled="actionLoading.has(item.registerEntryId) || item.entry.isReconciled"
                  @update:model-value="toggleCleared(item)")
              td(class="p-2 whitespace-nowrap") {{ new Date(item.entry.createdAt).toLocaleDateString() }}
              td(class="p-2")
                span {{ item.entry.description }}
              td(class="p-2 text-right whitespace-nowrap font-mono"
                :class="item.entry.amount < 0 ? 'money-negative' : 'money-positive'")
                | {{ formatMoney(item.entry.amount) }}
              td(class="p-2 text-right")
                UBadge(v-if="item.entry.isReconciled" color="success" variant="subtle" size="xs") Reconciled
                UBadge(v-else-if="item.isCleared" color="info" variant="subtle" size="xs") Cleared
                UBadge(v-else color="neutral" variant="subtle" size="xs") Open
        p(v-if="!workspace.items.length" class="text-center py-8 frog-text-muted")
          | No transactions in this statement period.

    UCard(
      v-if="uncategorizedClearedItems.length"
      :ui="{ root: 'overflow-visible' }")
      template(#header)
        .flex.items-center.justify-between
          h3(class="font-semibold") Needs category
          UBadge(color="warning" variant="subtle") {{ closeGap.uncategorizedCleared }}
      p(class="text-sm frog-text-muted mb-3") Every cleared entry must have a category before you can close.
      .space-y-3
        .flex.flex-col.gap-2.border-b.pb-3(
          v-for="item in uncategorizedClearedItems"
          :key="item.registerEntryId")
          .flex.flex-wrap.items-baseline.justify-between.gap-2
            span {{ new Date(item.entry.createdAt).toLocaleDateString() }} · {{ item.entry.description }}
            span(
              class="font-mono"
              :class="item.entry.amount < 0 ? 'money-negative' : 'money-positive'") {{ formatMoney(item.entry.amount) }}
          USelectMenu(
            :items="categorySelectItems"
            value-key="value"
            label-key="label"
            placeholder="Choose category…"
            search-placeholder="Search categories…"
            class="w-full sm:max-w-xl"
            :ui="{ content: 'z-[100] max-h-60' }"
            :content="{ position: 'popper', side: 'bottom', sideOffset: 8, collisionPadding: 16 }"
            :loading="actionLoading.has(`cat-${item.registerEntryId}`)"
            @update:model-value="(v) => setItemCategory(item, v)")

    UCard
      template(#header)
        .flex.items-center.gap-2
          UIcon(name="i-lucide-lock" class="text-primary")
          h3(class="font-semibold") Close period
      .space-y-4
        UAlert(
          v-if="canClosePeriod"
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          title="Ready to close")
          template(#description)
            p(class="text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight") {{ formatMoney(0) }}
            p(class="mt-2 text-base") Dollars match. 0 unmatched statement lines. 0 uncategorized cleared entries.
        UAlert(
          v-else-if="differenceIsZero"
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Dollars match — close is still blocked")
          template(#description)
            p(class="text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight") {{ formatMoney(0) }}
            ul(class="mt-2 text-sm space-y-0.5")
              li On statement, not in ledger: {{ closeGap.statementOnly }}
              li Cleared entries with no category: {{ closeGap.uncategorizedCleared }}
            p(class="mt-2 text-sm") Add, match, or ignore leftover statement lines, and assign a category to every cleared entry.
        UAlert(
          v-else
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Period is off")
          template(#description)
            p(class="mt-1 text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight"
              :class="closeGap.dollars < 0 ? 'money-negative' : 'money-positive'") {{ formatMoney(closeGap.dollars) }}
            p(class="mt-2 text-base font-medium") {{ entryCountLabel(closeGap.unresolvedEntries, "unresolved entry", "unresolved entries") }}
            ul(class="mt-2 text-sm space-y-0.5")
              li On statement, not in ledger: {{ closeGap.statementOnly }}
              li In ledger, not on statement: {{ closeGap.ledgerOnly }}
              li Conflicts: {{ closeGap.conflicts }}
              li Uncleared ledger rows: {{ closeGap.uncleared }}
              li Cleared entries with no category: {{ closeGap.uncategorizedCleared }}
            p(class="mt-2 text-sm") Dollars must match before you can close. No adjustment entry.
        p(class="text-sm frog-text-muted") When you close the period, all cleared transactions are marked as reconciled.
        UFormField(label="Close note (optional)")
          UInput(v-model="closeNote" placeholder="e.g. March 2026 statement")
        .flex.flex-wrap.gap-2
          UButton(
            color="primary"
            icon="i-lucide-check"
            :loading="actionLoading.has('close')"
            :disabled="!canClosePeriod || actionLoading.has('close')"
            @click="closePeriod") Close period
          UButton(variant="soft" to="/reconciliation") Back to accounts
</template>
