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
  isCleared: boolean;
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
  if (!registerEntries || registerEntries.length === 0) {
    return [];
  }

  const latestBalance = registerEntries.find((item) => item.isBalanceEntry);
  if (!latestBalance) {
    return [];
  }

  // Use the override balance argument if provided, otherwise use the balance entry's amount
  const startingBalance: number =
    balance !== undefined ? balance : +latestBalance.amount;

  latestBalance.balance = startingBalance;
  latestBalance.amount = startingBalance;

  const clearedEntries = registerEntries.filter(
    (item) => item.isCleared && !item.isBalanceEntry
  );

  // Split pending entries: those with isProjected=0 and isPending=1 go before balance
  const pendingEntriesBeforeBalance = registerEntries.filter(
    (item) =>
      !(item.isCleared || item.isBalanceEntry) &&
      !item.isProjected &&
      item.isPending
  );

  const pendingEntriesAfterBalance = registerEntries.filter(
    (item) =>
      !(item.isCleared || item.isBalanceEntry) &&
      !(!item.isProjected && item.isPending)
  );

  const returnedData: T[] = [];

  // Sort pending entries that come before balance
  const sortedPendingBeforeBalance = pendingEntriesBeforeBalance.sort(
    (a, b) => {
      if (dateTimeService.isAfter(b.createdAt, a.createdAt)) {
        return -1;
      } else if (dateTimeService.isBefore(b.createdAt, a.createdAt)) {
        return 1;
      } else {
        // If createdAt is the same, sort by amount
        if (type === "credit") {
          return +a.amount - +b.amount; // Ascending for credit
        } else {
          return +b.amount - +a.amount; // Descending for debit
        }
      }
    }
  );

  // Calculate running balance for pending entries working backwards from the balance
  // We need to work backwards from the balance amount to show what balance would be after each transaction
  let runningBalanceBackwards = startingBalance;

  // First, reverse the array to calculate backwards, then reverse it back for display
  const reversedForCalculation = [...sortedPendingBeforeBalance].reverse();

  // Calculate balances working backwards from the balance entry
  const pendingWithBalancesReversed = reversedForCalculation.map((item) => {
    runningBalanceBackwards -= +item.amount;
    return { ...item, balance: runningBalanceBackwards };
  });

  // Reverse back to display in correct chronological order
  const pendingWithBalances = pendingWithBalancesReversed.reverse();

  // Add pending entries before balance to returned data
  returnedData.push(...pendingWithBalances);

  // The balance entry shows the original balance (this is the actual account balance)
  latestBalance.balance = startingBalance;
  latestBalance.amount = startingBalance;

  // Add the balance entry
  returnedData.push(latestBalance);

  // Start running balance from the starting balance for entries after balance
  let runningBalance: number = startingBalance;

  // Process pending entries that go after balance
  const sortedPendingAfterBalance = pendingEntriesAfterBalance
    .sort((a, b) => {
      if (dateTimeService.isAfter(b.createdAt, a.createdAt)) {
        return -1;
      } else if (dateTimeService.isBefore(b.createdAt, a.createdAt)) {
        return 1;
      } else {
        // If createdAt is the same, sort by amount
        if (type === "credit") {
          return +a.amount - +b.amount; // Ascending for credit
        } else {
          return +b.amount - +a.amount; // Descending for debit
        }
      }
    })
    .map((item) => {
      runningBalance += +item.amount;
      return { ...item, balance: runningBalance };
    });

  runningBalance = startingBalance; // Use the override balance or balance entry's amount for cleared entries too
  const sortedClearedData = clearedEntries
    .sort((a, b) => {
      if (dateTimeService.isBefore(b.createdAt, a.createdAt)) {
        return -1;
      } else if (dateTimeService.isAfter(b.createdAt, a.createdAt)) {
        return 1;
      } else {
        // If createdAt is the same, sort by amount
        if (type === "credit") {
          return +b.amount - +a.amount; // Descending for debit
        } else {
          return +a.amount - +b.amount; // Ascending for credit
        }
      }
    })
    // we have to reverse to calculate balance correctly for cleared entries
    .reverse()
    .map((item) => {
      runningBalance += +item.amount * -1;

      return { ...item, balance: runningBalance };
    })
    // then reverse again to sort correctly
    .reverse();

  // Add pending entries after balance to returned data
  returnedData.push(...sortedPendingAfterBalance);

  let seq = 0;
  return [...sortedClearedData, ...returnedData].map((item) => {
    seq++;
    return { ...item, seq };
  });
};
