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
  console.log(`recalculateRunningBalanceAndSort called with ${registerEntries?.length || 0} entries`);
  console.log(`registerEntries:`, registerEntries);

  if (!registerEntries || registerEntries.length === 0) {
    console.log("No entries provided, returning empty array");
    return [];
  }

  const latestBalance = registerEntries.find((item) => item.isBalanceEntry);
  if (!latestBalance) {
    console.log("No balance entry found, returning empty array");
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

  const pendingEntries = registerEntries.filter(
    (item) => !(item.isCleared || item.isBalanceEntry)
  );

  const returnedData: T[] = [latestBalance];

  let runningBalance: number = startingBalance; // Start from the override balance or balance entry's amount

  const sortedPendingData = pendingEntries
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
      console.log("runningBalance", runningBalance);
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

      console.log("runningBalance", runningBalance);

      return { ...item, balance: runningBalance };
    })
    // then reverse again to sort correctly
    .reverse();

  returnedData.push(...sortedPendingData);
  let seq = 0;
  return [...sortedClearedData, ...returnedData].map((item) => {
    seq++;
    return { ...item, seq };
  });
};
