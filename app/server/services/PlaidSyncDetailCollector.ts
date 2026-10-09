import type { RegisterSyncStatsRow } from "./PlaidSyncNotificationService";

export type RegisterSyncTxRecord = {
  registerId: number;
  entryId: string;
  /** Human-readable "what changed" for updates. */
  note?: string;
};

export type RegisterSyncCategoryChangeRecord = {
  registerId: number;
  entryId: string;
  fromCategoryId: string | null;
  toCategoryId: string;
  /** categorySource on the change: "ai" | "rule" | "pfc" | "recurrence" | … */
  source: string | null;
};

/** US dollar formatting for sync summaries; sign kept explicit for outflows. */
export function formatSignedUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

/**
 * Accumulates per-transaction outcomes of one Plaid sync run so the digest
 * email can show what actually landed instead of just counts. Records store
 * register-entry ids only; the notification service resolves display data
 * (decrypted description, category names) from the DB at send time.
 */
export class PlaidSyncDetailCollector {
  private newRecords = new Map<number, RegisterSyncTxRecord[]>();
  private updatedRecords = new Map<number, RegisterSyncTxRecord[]>();
  private categoryChanges: RegisterSyncCategoryChangeRecord[] = [];

  recordNew(registerId: number, entryId: string): void {
    if (!entryId) return;
    const list = this.newRecords.get(registerId) ?? [];
    if (list.some((r) => r.entryId === entryId)) return;
    list.push({ registerId, entryId });
    this.newRecords.set(registerId, list);
  }

  recordUpdate(registerId: number, entryId: string, note?: string): void {
    if (!entryId) return;
    const list = this.updatedRecords.get(registerId) ?? [];
    const existing = list.find((r) => r.entryId === entryId);
    if (existing) {
      if (note && !existing.note?.includes(note)) {
        existing.note = existing.note ? `${existing.note}; ${note}` : note;
      }
      return;
    }
    list.push({ registerId, entryId, note });
    this.updatedRecords.set(registerId, list);
  }

  recordCategoryChange(change: RegisterSyncCategoryChangeRecord): void {
    if (!change.entryId || !change.toCategoryId) return;
    const existing = this.categoryChanges.find(
      (c) => c.entryId === change.entryId,
    );
    if (existing) {
      // Keep the first-recorded "from" so the original pre-sync category survives.
      existing.toCategoryId = change.toCategoryId;
      existing.source = change.source ?? existing.source;
      return;
    }
    this.categoryChanges.push({ ...change });
  }

  hasAnyRecords(): boolean {
    return (
      this.newRecords.size > 0 ||
      this.updatedRecords.size > 0 ||
      this.categoryChanges.length > 0
    );
  }

  /** Attaches recorded details to matching digest rows (non-mutating). */
  attachToRows(rows: RegisterSyncStatsRow[]): RegisterSyncStatsRow[] {
    if (!this.hasAnyRecords()) return rows;
    return rows.map((row) => {
      const newRecords = this.newRecords.get(row.accountRegisterId) ?? [];
      const updatedRecords = this.updatedRecords.get(row.accountRegisterId) ?? [];
      const categoryChanges = this.categoryChanges.filter(
        (c) => c.registerId === row.accountRegisterId,
      );
      if (
        newRecords.length === 0 &&
        updatedRecords.length === 0 &&
        categoryChanges.length === 0
      ) {
        return row;
      }
      const withDetails: RegisterSyncStatsRow = { ...row };
      if (newRecords.length > 0) withDetails.newRecords = newRecords;
      if (updatedRecords.length > 0) withDetails.updatedRecords = updatedRecords;
      if (categoryChanges.length > 0) {
        withDetails.categoryChanges = categoryChanges;
      }
      return withDetails;
    });
  }
}
