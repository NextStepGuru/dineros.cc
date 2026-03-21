import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError } from "h3";
import { recalculateRunningBalanceAndSort } from "~/lib/sort";
import { calculateAdjustedBalance } from "~/lib/calculateAdjustedBalance";

/** Same OR filter as `server/api/register.ts` for `direction: "future"`. */
export const futureRegisterEntryWhere = {
  OR: [
    { isCleared: false, isProjected: true },
    { isProjected: false, isCleared: false, isPending: true },
    { isBalanceEntry: true, isCleared: false },
    { isProjected: false, isManualEntry: true, isCleared: false },
  ],
};

export async function assertUserOwnsAccount(
  userId: number,
  accountId: string,
): Promise<void> {
  const link = await PrismaDb.userAccount.findFirst({
    where: { userId, accountId },
  });
  if (!link) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
}

export async function createAccountSnapshot(accountId: string) {
  const registers = await PrismaDb.accountRegister.findMany({
    where: { accountId, isArchived: false },
    include: { type: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  return PrismaDb.$transaction(async (tx) => {
    const snapshot = await tx.accountSnapshot.create({
      data: { accountId },
    });

    for (const reg of registers) {
      const pocketBalances = await tx.accountRegister.findMany({
        where: { subAccountRegisterId: reg.id },
        select: { balance: true },
      });

      const balanceBase = calculateAdjustedBalance(
        reg.latestBalance,
        pocketBalances,
      );

      const entries = await tx.registerEntry.findMany({
        where: {
          accountRegisterId: reg.id,
          ...futureRegisterEntryWhere,
        },
        orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
      });

      const toAmount = (
        entry: (typeof entries)[number],
      ): number => {
        const n = Number(entry.amount);
        const isLegacyInterest =
          reg.type.isCredit &&
          n > 0 &&
          (entry.typeId === 2 || entry.description === "Interest Charge");
        if (isLegacyInterest) return -n;
        return n;
      };

      const convertedEntries = entries.map((entry) => ({
        ...entry,
        amount: toAmount(entry),
        balance: Number(entry.balance),
      }));

      let balanceUpdated = recalculateRunningBalanceAndSort({
        registerEntries: convertedEntries,
        balance: balanceBase,
        type: reg.type.isCredit ? "credit" : "debit",
      });

      if (reg.type.isCredit) {
        balanceUpdated = balanceUpdated.map(
          (entry: { balance: number; [k: string]: unknown }) => ({
            ...entry,
            balance: Number(entry.balance) > 0 ? 0 : entry.balance,
          }),
        ) as typeof balanceUpdated;
      }

      const ars = await tx.accountRegisterSnapshot.create({
        data: {
          snapshotId: snapshot.id,
          accountRegisterId: reg.id,
          subAccountRegisterId: reg.subAccountRegisterId,
          collateralAssetRegisterId: reg.collateralAssetRegisterId,
          name: reg.name,
          balance: reg.balance,
          latestBalance: reg.latestBalance,
          typeId: reg.typeId,
        },
      });

      if (balanceUpdated.length > 0) {
        await tx.registerEntrySnapshot.createMany({
          data: balanceUpdated.map((e) => ({
            registerSnapshotId: ars.id,
            seq: e.seq ?? null,
            createdAt: e.createdAt as Date,
            description: String(e.description ?? ""),
            amount: Number(e.amount),
            balance: Number(e.balance),
            isProjected: Boolean(e.isProjected),
            isPending: Boolean(e.isPending),
            isBalanceEntry: Boolean(e.isBalanceEntry),
            isManualEntry: Boolean(e.isManualEntry),
            categoryId: e.categoryId ?? null,
          })),
        });
      }
    }

    return snapshot;
  });
}
