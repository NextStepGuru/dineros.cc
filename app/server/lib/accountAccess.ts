import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError } from "h3";

/** Prisma `where` fragment: account has a UserAccount row for this user. */
export function accountWhereUserIsMember(userId: number) {
  return {
    userAccounts: { some: { userId } },
  };
}

export async function assertUserHasAccountAccess(
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

/** Backward-compatible name used across the codebase. */
export const assertUserOwnsAccount = assertUserHasAccountAccess;

/** Budget belongs to an account the user is linked to with budget visibility. */
export function budgetWhereForAccountMember(userId: number, budgetId: number) {
  return {
    id: budgetId,
    isArchived: false,
    account: {
      userAccounts: {
        some: {
          userId,
          canViewBudgets: true,
        },
      },
    },
  };
}
