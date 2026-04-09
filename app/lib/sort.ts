import { dateTimeService } from "~/server/services/forecast";

export type PartialRegisterEntry = {
  seq?: number | null;
  createdAt: any; // Changed from Moment | Date to any to handle both types
  amount: number | string;
  balance: number | string;
  isBalanceEntry: boolean;
  isPending: boolean;
  isProjected: boolean;
  isManualEntry: boolean;
  isMatched: boolean;
  isCleared: boolean;
};

// Clear helper functions to determine entry placement (relative to synthetic balance row).
const shouldGoBeforeBalance = (entry: PartialRegisterEntry): boolean => {
  if (entry.isManualEntry) {
    // Manual lines render below the balance row; running balance continues forward after anchor.
    return false;
  }

  // Non-manual: any real (non-projected) uncleared activity is before the balance anchor
  // (e.g. pending bank activity not yet cleared), including posted imports not cleared yet.
  return !entry.isProjected;
};

const isCleared = (entry: PartialRegisterEntry): boolean => {
  return entry.isCleared && !entry.isBalanceEntry;
};

const isBalance = (entry: PartialRegisterEntry): boolean => {
  return entry.isBalanceEntry;
};

function compareEntryCreatedAt(
  aCreated: PartialRegisterEntry["createdAt"],
  bCreated: PartialRegisterEntry["createdAt"],
): number {
  if (dateTimeService.isAfter(aCreated, bCreated)) return 1;
  if (dateTimeService.isBefore(aCreated, bCreated)) return -1;
  return 0;
}

// Simple chronological sort with amount tiebreaker
const sortEntriesChronologically = <T extends PartialRegisterEntry>(
  entries: T[],
  type: "credit" | "debit",
  direction: "oldest-first" | "newest-first" = "oldest-first",
): T[] => {
  return [...entries].sort((a, b) => {
    const aTime = compareEntryCreatedAt(a.createdAt, b.createdAt);

    if (direction === "newest-first" && aTime !== 0) {
      return -aTime;
    }
    if (direction === "oldest-first" && aTime !== 0) {
      return aTime;
    }

    // If same date, sort by amount (different rules for credit vs debit)
    const aAmount = +a.amount;
    const bAmount = +b.amount;

    if (type === "credit") {
      return aAmount - bAmount; // Ascending for credit
    } else {
      return bAmount - aAmount; // Descending for debit
    }
  });
};

// Calculate running balance forward from a starting point
const calculateForwardBalance = <T extends PartialRegisterEntry>(
  entries: T[],
  startingBalance: number,
): T[] => {
  let runningBalance = startingBalance;
  return entries.map((entry) => {
    runningBalance += +entry.amount;
    return { ...entry, balance: runningBalance };
  });
};

// Calculate running balance backward from a starting point
const calculateBackwardBalance = <T extends PartialRegisterEntry>(
  entries: T[],
  startingBalance: number,
): T[] => {
  let runningBalance = startingBalance;

  // Work backwards through the entries
  const entriesWithBalance = [...entries].reverse().map((entry) => {
    runningBalance -= +entry.amount;
    return { ...entry, balance: runningBalance };
  });

  // Return in original order
  return entriesWithBalance.reverse();
};

// Calculate cleared entries balance (special case - works backward with negative amounts)
const calculateClearedBalance = <T extends PartialRegisterEntry>(
  entries: T[],
  startingBalance: number,
  type: "credit" | "debit",
): T[] => {
  // Cleared entries need special sorting (oldest first, but different amount rules)
  const sortedEntries = [...entries].sort((a, b) => {
    const aTime = compareEntryCreatedAt(a.createdAt, b.createdAt);

    if (aTime !== 0) return aTime; // Oldest first

    // Cleared entries have different amount sorting
    const aAmount = +a.amount;
    const bAmount = +b.amount;

    if (type === "credit") {
      return bAmount - aAmount; // Descending for credit (opposite of normal)
    } else {
      return aAmount - bAmount; // Ascending for debit (opposite of normal)
    }
  });

  // Calculate balance working backwards with negative amounts
  let runningBalance = startingBalance;
  const reversed = [...sortedEntries].reverse().map((entry) => {
    runningBalance += +entry.amount * -1;
    return { ...entry, balance: runningBalance };
  });

  return reversed.reverse();
};

export const recalculateRunningBalanceAndSort = <
  T extends PartialRegisterEntry = PartialRegisterEntry,
>({
  registerEntries,
  balance,
  type,
}: {
  registerEntries: T[];
  balance: number;
  type: "credit" | "debit";
}): T[] => {
  // Early exit for empty arrays
  if (!registerEntries || registerEntries.length === 0) {
    return [];
  }

  // Find and validate balance entry
  const balanceEntry = registerEntries.find(isBalance);
  if (!balanceEntry) {
    // Fallback path: some datasets can legitimately miss a synthetic balance entry.
    // In that case, still return chronologically sorted entries with forward running balances.
    const sortedEntries = sortEntriesChronologically(
      registerEntries,
      type,
      "oldest-first",
    );
    const processedEntries = calculateForwardBalance(sortedEntries, balance);
    return processedEntries.map((entry, index) => ({
      ...entry,
      seq: index + 1,
    }));
  }

  // Set up the starting balance (use explicit register amount when caller omits balance)
  const startingBalance = balance ?? +balanceEntry.amount;
  balanceEntry.balance = startingBalance;
  balanceEntry.amount = startingBalance;

  // Categorize all entries by type
  const clearedEntries = registerEntries.filter(isCleared);
  const entriesBeforeBalance = registerEntries.filter(
    (entry) =>
      !isCleared(entry) &&
      !isBalance(entry) &&
      shouldGoBeforeBalance(entry),
  );
  const entriesAfterBalance = registerEntries.filter(
    (entry) =>
      !isCleared(entry) &&
      !isBalance(entry) &&
      !shouldGoBeforeBalance(entry),
  );

  // Process each category
  const processedClearedEntries = calculateClearedBalance(
    clearedEntries,
    startingBalance,
    type,
  );

  const sortedEntriesBeforeBalance = sortEntriesChronologically(
    entriesBeforeBalance,
    type,
    "oldest-first",
  );
  // Pending rows strictly before the anchor timestamp are not yet reflected in
  // `startingBalance`; backward walk (pre-anchor ledger) would show an inflated
  // "balance before debit". Use the same forward accumulation as post-anchor rows.
  const onlyPendingStrictlyBeforeAnchor =
    sortedEntriesBeforeBalance.length > 0 &&
    sortedEntriesBeforeBalance.every(
      (e) =>
        e.isPending &&
        dateTimeService.isBefore(e.createdAt, balanceEntry.createdAt),
    );
  const useForwardBeforeBalance = onlyPendingStrictlyBeforeAnchor;
  const processedEntriesBeforeBalance = useForwardBeforeBalance
    ? calculateForwardBalance(sortedEntriesBeforeBalance, startingBalance)
    : calculateBackwardBalance(sortedEntriesBeforeBalance, startingBalance);

  const sortedEntriesAfterBalance = sortEntriesChronologically(
    entriesAfterBalance,
    type,
    "oldest-first",
  );
  const processedEntriesAfterBalance = calculateForwardBalance(
    sortedEntriesAfterBalance,
    startingBalance,
  );

  // Combine everything in the correct order and add sequence numbers
  const allEntries = [
    ...processedClearedEntries,
    ...processedEntriesBeforeBalance,
    balanceEntry,
    ...processedEntriesAfterBalance,
  ];

  // Add sequence numbers
  return allEntries.map((entry, index) => ({
    ...entry,
    seq: index + 1,
  }));
};
