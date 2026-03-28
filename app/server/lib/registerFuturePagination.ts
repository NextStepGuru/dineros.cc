/**
 * Future-register tab: paginate the full sorted ledger from index 0 so pending / pre-balance
 * rows are visible ahead of the balance line.
 * Extends the window when it would end before the first loan/debt transfer *after* the balance
 * (scan starts at balance so type-6 noise above the anchor is ignored).
 */

export type FutureRegisterPaginationRow = {
  isBalanceEntry?: boolean;
  isProjected?: boolean;
  typeId?: number | null;
  description?: string | null;
  sourceAccountRegisterId?: number | null;
};

const LOAN_PAY_WINDOW_TAIL = 32;

function entryDesc(e: FutureRegisterPaginationRow): string {
  if (typeof e.description === "string") return e.description;
  if (e.description != null) return String(e.description);
  return "";
}

function isLoanOrDebtPaymentType6(
  e: FutureRegisterPaginationRow,
  loanTransferPeerIds: Set<number>,
): boolean {
  if (e.typeId !== 6) return false;
  const d = entryDesc(e);
  if (d.startsWith("Savings goal contribution")) return false;
  const sid = e.sourceAccountRegisterId;
  if (sid != null && loanTransferPeerIds.has(sid)) return true;
  return d.includes("Payment to") || d.startsWith("Transfer for Extra debt");
}

export function paginateFutureRegisterWindow<T extends FutureRegisterPaginationRow>(
  entries: T[],
  pageSkip: number,
  pageSize: number,
  loanTransferPeerIds: Set<number>,
): { paginated: T[]; hasMore: boolean } {
  const balanceIdx = entries.findIndex((e) => e.isBalanceEntry);
  const projectedIdx = entries.findIndex((e) => e.isProjected);
  // Only scan for loan/debt payment rows at or after the register anchor — not type-6 rows
  // that might appear above the balance in pathological sort orders.
  let loanScanStart = 0;
  if (balanceIdx >= 0) {
    loanScanStart = balanceIdx;
  } else if (projectedIdx >= 0) {
    loanScanStart = projectedIdx;
  }
  const sliceStart = pageSkip;

  let transferAnchorIdx = -1;
  for (let i = loanScanStart; i < entries.length; i++) {
    const entry = entries[i];
    if (entry !== undefined && isLoanOrDebtPaymentType6(entry, loanTransferPeerIds)) {
      transferAnchorIdx = i;
      break;
    }
  }

  const sliceEndDefault = sliceStart + pageSize;
  let sliceEnd = sliceEndDefault;
  if (
    transferAnchorIdx >= 0 &&
    sliceStart <= transferAnchorIdx &&
    sliceEnd <= transferAnchorIdx
  ) {
    sliceEnd = Math.min(
      entries.length,
      transferAnchorIdx + 1 + LOAN_PAY_WINDOW_TAIL,
    );
  }

  return {
    paginated: entries.slice(sliceStart, sliceEnd),
    hasMore: sliceEnd < entries.length,
  };
}
