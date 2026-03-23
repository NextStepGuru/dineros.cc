import type { prisma } from "~/server/clients/prismaClient";
import { cloneBudget } from "~/server/services/budgetCloneService";
import { cloneCategoriesForAccount } from "~/server/services/categoryCloneService";
import { accountWhereUserIsMember } from "~/server/lib/accountAccess";

type Tx = typeof prisma;

export type DuplicateAccountWorkspaceParams = {
  userId: number;
  /** Display name for the new financial Account and the first Budget on it. */
  name: string;
  /** Budget to copy from. Omit to use the user's default budget. */
  sourceBudgetId?: number;
};

/**
 * Creates a new financial Account, links the same users as the source account,
 * clones categories (new UUIDs), creates a Budget, and deep-clones the source budget
 * into it with remapped category ids and new account id on all rows.
 */
export async function duplicateAccountWorkspace(
  tx: Tx,
  params: DuplicateAccountWorkspaceParams,
): Promise<{ accountId: string; budgetId: number }> {
  const { userId, name, sourceBudgetId } = params;

  const sourceBudget = await tx.budget.findFirst({
    where:
      sourceBudgetId === undefined || sourceBudgetId === null
        ? { isDefault: true, account: accountWhereUserIsMember(userId) }
        : {
            id: sourceBudgetId,
            account: accountWhereUserIsMember(userId),
          },
    select: { id: true, accountId: true },
  });
  if (!sourceBudget) {
    throw new Error("Source budget not found for account workspace duplicate");
  }

  const sourceAccountId = sourceBudget.accountId;

  const newAccount = await tx.account.create({
    data: {
      name,
      isDefault: false,
    },
    select: { id: true },
  });
  const newAccountId = newAccount.id;

  const userLinks = await tx.userAccount.findMany({
    where: { accountId: sourceAccountId },
    select: { userId: true },
  });
  for (const link of userLinks) {
    await tx.userAccount.create({
      data: { userId: link.userId, accountId: newAccountId },
    });
  }

  const categoryIdMap = await cloneCategoriesForAccount(
    tx,
    sourceAccountId,
    newAccountId,
  );

  const newBudget = await tx.budget.create({
    data: {
      name,
      accountId: newAccountId,
      userId,
      isDefault: false,
    },
    select: { id: true },
  });

  await cloneBudget(tx, sourceBudget.id, newBudget.id, sourceAccountId, {
    targetAccountId: newAccountId,
    categoryIdMap,
  });

  return { accountId: newAccountId, budgetId: newBudget.id };
}
