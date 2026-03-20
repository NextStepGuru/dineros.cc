import { formatDate } from "~/lib/utils";
import type {
  AccountRegister,
  AccountSnapshot,
  AccountSnapshotDetail,
  AccountSnapshotRegisterRow,
} from "~/types/types";

function buildSyntheticAccountRegisters(
  accountId: string,
  budgetId: number,
  rows: AccountSnapshotRegisterRow[],
): AccountRegister[] {
  const now = new Date();
  return rows.map((r) => ({
    id: r.accountRegisterId,
    accountId,
    subAccountRegisterId: r.subAccountRegisterId ?? undefined,
    typeId: r.typeId,
    budgetId,
    name: r.name,
    balance: r.balance,
    latestBalance: r.latestBalance,
    minPayment: null,
    statementAt: now,
    statementIntervalId: 3,
    apr1: null,
    apr1StartAt: null,
    apr2: null,
    apr2StartAt: null,
    apr3: null,
    apr3StartAt: null,
    targetAccountRegisterId: null,
    collateralAssetRegisterId: r.collateralAssetRegisterId,
    loanStartAt: null,
    loanPaymentsPerYear: null,
    loanTotalYears: null,
    loanOriginalAmount: null,
    sortOrder: 0,
    loanPaymentSortOrder: 0,
    savingsGoalSortOrder: 0,
    accountSavingsGoal: null,
    minAccountBalance: 0,
    allowExtraPayment: false,
    isArchived: false,
  }));
}

export function useSnapshotMode() {
  const activeSnapshotId = useState<number | null>(
    "snapshot:activeId",
    () => null,
  );
  const activeSnapshotCreatedAt = useState<string | null>(
    "snapshot:activeAt",
    () => null,
  );
  const activeSnapshotAccountId = useState<string | null>(
    "snapshot:accountId",
    () => null,
  );
  const snapshotRegisterRows = useState<AccountSnapshotRegisterRow[] | null>(
    "snapshot:registerRows",
    () => null,
  );
  const snapshotList = useState<Pick<AccountSnapshot, "id" | "createdAt">[]>(
    "snapshot:list",
    () => [],
  );
  const selectedSnapshotValue = useState<number | null>(
    "snapshot:selectedValue",
    () => null,
  );

  // Snapshot mode is valid only when the selected snapshot payload is fully loaded.
  const isSnapshotMode = computed(
    () =>
      activeSnapshotId.value != null &&
      Boolean(activeSnapshotAccountId.value) &&
      Boolean(activeSnapshotCreatedAt.value) &&
      Boolean(snapshotRegisterRows.value?.length),
  );

  const snapshotViewItems = computed(() => {
    const live = { label: "Live", value: null as number | null };
    const rest =
      snapshotList.value?.map((s) => ({
        label: formatDate(s.createdAt) ?? `Snapshot #${s.id}`,
        value: s.id as number | null,
      })) ?? [];
    return [live, ...rest];
  });

  const registerSnapshotIdByRegisterId = computed(() => {
    const rows = snapshotRegisterRows.value;
    if (!rows?.length) return {} as Record<number, number>;
    const m: Record<number, number> = {};
    for (const r of rows) {
      m[r.accountRegisterId] = r.registerSnapshotId;
    }
    return m;
  });

  const syntheticAccountRegisters = computed(() => {
    const rows = snapshotRegisterRows.value;
    const accountId = activeSnapshotAccountId.value;
    if (
      !isSnapshotMode.value ||
      !rows?.length ||
      !accountId
    ) {
      return [] as AccountRegister[];
    }
    const authStore = useAuthStore();
    return buildSyntheticAccountRegisters(
      accountId,
      authStore.getBudgetId,
      rows,
    );
  });

  async function fetchSnapshots(accountId: string) {
    const { $api } = useNuxtApp();
    const rows = await ($api as typeof $fetch)<Pick<AccountSnapshot, "id" | "createdAt">[]>(
      "/api/snapshots",
      { query: { accountId } },
    );
    snapshotList.value = rows ?? [];
  }

  async function loadSnapshotDetail(snapshotId: number): Promise<AccountSnapshotDetail> {
    const { $api } = useNuxtApp();
    return await ($api as typeof $fetch)<AccountSnapshotDetail>(
      `/api/snapshot/${snapshotId}`,
    );
  }

  /** Applies snapshot detail to shared state (both pages stay in sync). */
  function applySnapshotDetail(detail: AccountSnapshotDetail) {
    activeSnapshotId.value = detail.id;
    activeSnapshotCreatedAt.value = detail.createdAt;
    activeSnapshotAccountId.value = detail.accountId;
    snapshotRegisterRows.value = detail.registers;
  }

  async function selectSnapshot(snapshotId: number | null, accountId: string) {
    if (snapshotId == null) {
      exitSnapshot();
      return;
    }
    const detail = await loadSnapshotDetail(snapshotId);
    if (detail.accountId !== accountId) {
      exitSnapshot();
      return;
    }
    applySnapshotDetail(detail);
  }

  function exitSnapshot() {
    activeSnapshotId.value = null;
    activeSnapshotCreatedAt.value = null;
    activeSnapshotAccountId.value = null;
    snapshotRegisterRows.value = null;
  }

  function exitSnapshotView() {
    exitSnapshot();
    selectedSnapshotValue.value = null;
  }

  /**
   * Wire list fetch + menu selection → snapshot load. Prefer a single call site (see `plugins/snapshot-menu.client.ts`).
   */
  function initSnapshotMenuSync(
    getAccountId: () => string | null | undefined,
  ) {
    const toast = useToast();

    // Heal stale/incomplete state from previous navigation/session.
    watch(
      [activeSnapshotId, activeSnapshotAccountId, activeSnapshotCreatedAt, snapshotRegisterRows],
      ([id, accountId, createdAt, rows]) => {
        if (id == null) return;
        if (!accountId || !createdAt || !rows?.length) {
          exitSnapshot();
        }
      },
      { immediate: true },
    );

    watch(
      snapshotViewItems,
      (items) => {
        if (!items.length) return;
        const cur = selectedSnapshotValue.value;
        const found = items.find((i) => i.value === cur);
        if (!found) selectedSnapshotValue.value = null;
      },
      { immediate: true },
    );

    watch(
      () => activeSnapshotId.value,
      (id) => {
        const items = snapshotViewItems.value;
        if (!items.length) return;
        if (id == null) {
          if (selectedSnapshotValue.value != null) {
            selectedSnapshotValue.value = null;
          }
          return;
        }
        const found = items.find((i) => i.value === id);
        if (found && selectedSnapshotValue.value !== id) {
          selectedSnapshotValue.value = id;
        }
      },
    );

    watch(
      () => selectedSnapshotValue.value,
      async (val) => {
        // "Live" must always clear snapshot mode, even if account context
        // has not resolved yet.
        if (val == null) {
          if (activeSnapshotId.value != null) {
            exitSnapshot();
          }
          return;
        }

        const aid = getAccountId() ?? undefined;
        if (!aid) return;
        if (activeSnapshotId.value === val) return;
        try {
          await selectSnapshot(val, aid);
        } catch {
          toast.add({
            color: "error",
            description: "Could not load snapshot.",
          });
          exitSnapshot();
          selectedSnapshotValue.value = null;
        }
      },
      { immediate: true },
    );

    watch(
      () => getAccountId(),
      (aid) => {
        if (aid) void fetchSnapshots(aid);
      },
      { immediate: true },
    );
  }

  return {
    activeSnapshotId,
    activeSnapshotCreatedAt,
    activeSnapshotAccountId,
    snapshotRegisterRows,
    snapshotList,
    selectedSnapshotValue,
    snapshotViewItems,
    isSnapshotMode,
    registerSnapshotIdByRegisterId,
    syntheticAccountRegisters,
    fetchSnapshots,
    loadSnapshotDetail,
    applySnapshotDetail,
    selectSnapshot,
    exitSnapshot,
    exitSnapshotView,
    initSnapshotMenuSync,
    buildSyntheticAccountRegisters,
  };
}
