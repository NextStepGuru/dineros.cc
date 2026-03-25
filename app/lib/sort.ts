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

// Clear helper functions to determine entry placement
const shouldGoBeforeBalance = (entry: PartialRegisterEntry): boolean => {
  // For manual entries, only consider the isMatched property
  if (entry.isManualEntry) {
    return entry.isMatched === true;
  }

  // For non-manual entries, use the pending condition
  // Pending entries that aren't projected (real pending transactions) go before balance
  const pendingCondition = !entry.isProjected && entry.isPending;

  return pendingCondition;
};

const isCleared = (entry: PartialRegisterEntry): boolean => {
  return entry.isCleared && !entry.isBalanceEntry;
};

const isBalance = (entry: PartialRegisterEntry): boolean => {
  return entry.isBalanceEntry;
};

// Simple chronological sort with amount tiebreaker
const sortEntriesChronologically = <T extends PartialRegisterEntry>(
  entries: T[],
  type: "credit" | "debit",
  direction: "oldest-first" | "newest-first" = "oldest-first"
): T[] => {
  return [...entries].sort((a, b) => {
    // Date comparison
    const aTime = dateTimeService.isAfter(a.createdAt, b.createdAt)
      ? 1
      : dateTimeService.isBefore(a.createdAt, b.createdAt)
      ? -1
      : 0;

    if (direction === "newest-first") {
      if (aTime !== 0) return -aTime; // Reverse chronological order
    } else {
      if (aTime !== 0) return aTime; // Normal chronological order
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
  startingBalance: number
): T[] => {
  let runningBalance = startingBalance;
  return entries.map((entry) => ({
    ...entry,
    balance: (runningBalance += +entry.amount),
  }));
};

// Calculate running balance backward from a starting point
const calculateBackwardBalance = <T extends PartialRegisterEntry>(
  entries: T[],
  startingBalance: number
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
  type: "credit" | "debit"
): T[] => {
  // Cleared entries need special sorting (oldest first, but different amount rules)
  const sortedEntries = [...entries].sort((a, b) => {
    const aTime = dateTimeService.isAfter(a.createdAt, b.createdAt)
      ? 1
      : dateTimeService.isBefore(a.createdAt, b.createdAt)
      ? -1
      : 0;

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
  T extends PartialRegisterEntry = PartialRegisterEntry
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
      "oldest-first"
    );
    const processedEntries = calculateForwardBalance(sortedEntries, balance);
    return processedEntries.map((entry, index) => ({
      ...entry,
      seq: index + 1,
    }));
  }

  // Set up the starting balance
  const startingBalance =
    balance !== undefined ? balance : +balanceEntry.amount;
  balanceEntry.balance = startingBalance;
  balanceEntry.amount = startingBalance;

  // Categorize all entries by type
  const clearedEntries = registerEntries.filter(isCleared);
  const entriesBeforeBalance = registerEntries.filter(
    (entry) =>
      !isCleared(entry) && !isBalance(entry) && shouldGoBeforeBalance(entry)
  );
  const entriesAfterBalance = registerEntries.filter(
    (entry) =>
      !isCleared(entry) && !isBalance(entry) && !shouldGoBeforeBalance(entry)
  );

  // Process each category
  const processedClearedEntries = calculateClearedBalance(
    clearedEntries,
    startingBalance,
    type
  );

  const sortedEntriesBeforeBalance = sortEntriesChronologically(
    entriesBeforeBalance,
    type,
    "oldest-first"
  );
  const processedEntriesBeforeBalance = calculateBackwardBalance(
    sortedEntriesBeforeBalance,
    startingBalance
  );

  const sortedEntriesAfterBalance = sortEntriesChronologically(
    entriesAfterBalance,
    type,
    "oldest-first"
  );
  const processedEntriesAfterBalance = calculateForwardBalance(
    sortedEntriesAfterBalance,
    startingBalance
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
