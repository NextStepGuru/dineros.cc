import type { RegisterEntry } from "~/types/types";

/** Seeded `register_entry_type.id` values. */
export const REGISTER_ENTRY_TYPE = {
  BALANCE: 1,
  INTEREST_CHARGE: 2,
  INTEREST_EARNED: 3,
  LOAN_PAYMENT: 4,
  CREDIT_CARD_PAYMENT: 5,
  TRANSFER: 6,
  MANUAL: 7,
  PLAID: 8,
  REOCCURRENCE: 9,
  INITIAL_BALANCE: 10,
} as const;

export type RegisterEntryOrigin = {
  icon: string;
  label: string;
};

function hasPlaidLink(entry: RegisterEntry): boolean {
  const id = entry.plaidId;
  return Boolean(id && String(id).trim() !== "") || entry.isMatched === true;
}

function entryDay(createdAt: string): string {
  return createdAt.length >= 10 ? createdAt.slice(0, 10) : createdAt;
}

function isRecurringRow(entry: RegisterEntry): boolean {
  if (entry.reoccurrenceId != null) return true;
  if (entry.typeId === REGISTER_ENTRY_TYPE.REOCCURRENCE) return true;
  if (
    entry.id?.startsWith("snap-") &&
    entry.isProjected &&
    !entry.isManualEntry &&
    !entry.isBalanceEntry
  ) {
    return true;
  }
  return false;
}

function isRecurrenceSettled(entry: RegisterEntry, todayISO: string): boolean {
  if (hasPlaidLink(entry)) return true;
  if (entry.isProjected === false) return true;
  return entryDay(entry.createdAt) < todayISO;
}

export function registerEntryOrigin(
  entry: RegisterEntry,
  todayISO: string,
): RegisterEntryOrigin | null {
  if (isRecurringRow(entry)) {
    if (isRecurrenceSettled(entry, todayISO)) {
      return {
        icon: "i-lucide-badge-check",
        label: hasPlaidLink(entry)
          ? "Matched to a Plaid transaction"
          : "Occurrence date has passed",
      };
    }
    return { icon: "i-lucide-repeat", label: "Recurring" };
  }

  if (
    entry.isBalanceEntry ||
    entry.typeId === REGISTER_ENTRY_TYPE.BALANCE ||
    entry.typeId === REGISTER_ENTRY_TYPE.INITIAL_BALANCE
  ) {
    return { icon: "i-lucide-scale", label: "Balance entry" };
  }

  if (entry.typeId === REGISTER_ENTRY_TYPE.TRANSFER) {
    return { icon: "i-lucide-arrow-left-right", label: "Transfer" };
  }

  if (entry.typeId === REGISTER_ENTRY_TYPE.INTEREST_CHARGE) {
    return { icon: "i-lucide-percent", label: "Interest charge" };
  }

  if (entry.typeId === REGISTER_ENTRY_TYPE.INTEREST_EARNED) {
    return { icon: "i-lucide-trending-up", label: "Interest earned" };
  }

  if (entry.typeId === REGISTER_ENTRY_TYPE.LOAN_PAYMENT) {
    return { icon: "i-lucide-banknote", label: "Loan payment" };
  }

  if (entry.typeId === REGISTER_ENTRY_TYPE.CREDIT_CARD_PAYMENT) {
    return { icon: "i-lucide-credit-card", label: "Credit card payment" };
  }

  if (entry.isManualEntry || entry.typeId === REGISTER_ENTRY_TYPE.MANUAL) {
    return { icon: "i-lucide-pencil", label: "Manual entry" };
  }

  if (hasPlaidLink(entry) || entry.typeId === REGISTER_ENTRY_TYPE.PLAID) {
    return { icon: "i-lucide-building-2", label: "Bank import" };
  }

  return null;
}
