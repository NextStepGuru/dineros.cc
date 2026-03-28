import {
  recalculateRunningBalanceAndSort,
  type PartialRegisterEntry,
} from "~/lib/sort";
import { calculateAdjustedBalance } from "~/lib/calculateAdjustedBalance";
import { dateTimeService } from "~/server/services/forecast";
import type { PrismaClient } from "@prisma/client";

/**
 * Same OR filter as `server/api/register.ts` for `direction: "future"`.
 * All uncleared (non-reconciled) ledger rows stay on Future until the user clears them;
 * reconciled rows are Past-only so they are not duplicated across tabs.
 */
export const futureRegisterEntryOr = [
  { isCleared: false, isReconciled: false },
] as const;

export function registerBelongsToUserAccountWhere(
  accountId: string,
  userId: number,
) {
  return {
    register: {
      account: {
        is: {
          userAccounts: { some: { userId } },
          id: accountId,
        },
      },
    },
  };
}

export async function resolveLoanTransferPeerIds(
  db: PrismaClient,
  accountId: string,
  accountRegisterId: number,
  targetAccountRegisterId: number | null,
): Promise<Set<number>> {
  const loanTransferPeerIds = new Set<number>();
  const paidFromHere = await db.accountRegister.findMany({
    where: {
      accountId,
      targetAccountRegisterId: accountRegisterId,
    },
    select: { id: true },
  });
  for (const r of paidFromHere) loanTransferPeerIds.add(r.id);
  if (targetAccountRegisterId != null) {
    loanTransferPeerIds.add(targetAccountRegisterId);
  }
  return loanTransferPeerIds;
}

/** Prisma `Decimal` is structurally compatible; avoids coupling to `@prisma/client` paths. */
type DecimalLike = { toNumber(): number; toString(): string };

/** Register rows for `lib/sort` (amount/balance may be Prisma `Decimal` before conversion). */
export type LedgerSortableEntry = Omit<
  PartialRegisterEntry,
  "amount" | "balance"
> & {
  amount: PartialRegisterEntry["amount"] | DecimalLike;
  balance: PartialRegisterEntry["balance"] | DecimalLike;
  typeId?: number | null;
  description?: string | null;
};

export function stripRegisterEntryPlaidJson<T extends { plaidJson?: unknown }>(
  entries: T[],
): Omit<T, "plaidJson">[] {
  return entries.map(({ plaidJson: _p, ...rest }) => rest);
}

/** Legacy credit interest sign fix — same as register API. */
export function toAmountForRegisterEntry(
  entry: {
    amount: unknown;
    typeId?: number | null;
    description?: string | null;
  },
  isCredit: boolean,
): number {
  const n = Number(entry.amount);
  const isLegacyInterest =
    isCredit &&
    n > 0 &&
    (entry.typeId === 2 || entry.description === "Interest Charge");
  if (isLegacyInterest) return -n;
  return n;
}

export function buildFutureLedgerSorted<T extends LedgerSortableEntry>(params: {
  registerEntriesWithoutPlaidJson: T[];
  latestBalance: unknown;
  pocketBalances: Array<{ balance: unknown }>;
  isCredit: boolean;
}): Array<T & { amount: number; balance: number }> {
  type RowWithNumbers = T & { amount: number; balance: number };

  const balance = calculateAdjustedBalance(
    params.latestBalance,
    params.pocketBalances,
  );
  const convertedEntries = params.registerEntriesWithoutPlaidJson.map(
    (entry) => ({
      ...entry,
      amount: toAmountForRegisterEntry(entry, params.isCredit),
      balance: Number(entry.balance),
    }),
  ) as RowWithNumbers[];

  let balanceUpdated = recalculateRunningBalanceAndSort<RowWithNumbers>({
    registerEntries: convertedEntries,
    balance,
    type: params.isCredit ? "credit" : "debit",
  });

  if (params.isCredit) {
    balanceUpdated = balanceUpdated.map((entry: RowWithNumbers) => {
      const b = Number(entry.balance);
      return { ...entry, balance: Math.min(b, 0) };
    });
  }

  return balanceUpdated;
}

/**
 * Balance after all ledger rows (in register display/processing order) with
 * transaction date on or before `asOf` (inclusive). Used for "projected balance
 * at end of month," not intra-day scrubbing within the month.
 */
export function futureBalanceAtOrBeforeAsOf(
  ledger: Array<{ createdAt: Date; balance: number }>,
  asOf: Date,
  fallbackBalance: number,
): number {
  let last: number | undefined;
  for (const e of ledger) {
    if (dateTimeService.isSameOrBefore(e.createdAt, asOf)) {
      last = e.balance;
    }
  }
  return last ?? fallbackBalance;
}

/** Projected register balance at end of day on `asOf` (e.g. month end), same rules as future register API. */
export function forecastBalanceAtMonthEnd<
  T extends LedgerSortableEntry,
>(params: {
  registerEntriesWithoutPlaidJson: T[];
  latestBalance: unknown;
  pocketBalances: Array<{ balance: unknown }>;
  isCredit: boolean;
  asOf: Date;
}): number {
  const fallback = calculateAdjustedBalance(
    params.latestBalance,
    params.pocketBalances,
  );
  const ledger = buildFutureLedgerSorted({
    registerEntriesWithoutPlaidJson: params.registerEntriesWithoutPlaidJson,
    latestBalance: params.latestBalance,
    pocketBalances: params.pocketBalances,
    isCredit: params.isCredit,
  });
  return futureBalanceAtOrBeforeAsOf(ledger, params.asOf, fallback);
}
