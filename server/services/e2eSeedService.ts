import { randomBytes } from "node:crypto";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import HashService from "~/server/services/HashService";
import { dateTimeService } from "~/server/services/forecast";
import { log } from "~/server/logger";

/** Stable email for staging E2E; seed replaces this user on each run. */
export const E2E_USER_EMAIL = "e2e-test@dineros.cc";

function randomPassword(): string {
  return randomBytes(24).toString("base64url");
}

export type E2ESeedResult = {
  email: string;
  password: string;
  userId: number;
  budgetId: number;
  accountId: string;
  checkingRegisterId: number;
  savingsRegisterId: number;
  categoryId: string;
  reoccurrenceId: number;
  savingsGoalId: number;
};

/**
 * Remove the E2E user and all related workspace data (same accounts as signup flow).
 */
export async function deleteE2EUserByEmail(
  email: string = E2E_USER_EMAIL,
): Promise<{ deleted: boolean }> {
  const user = await PrismaDb.user.findUnique({ where: { email } });
  if (!user) {
    return { deleted: false };
  }

  const userAccounts = await PrismaDb.userAccount.findMany({
    where: { userId: user.id },
    select: { accountId: true },
  });
  const accountIds = userAccounts.map((ua) => ua.accountId);
  if (accountIds.length === 0) {
    await PrismaDb.user.delete({ where: { id: user.id } });
    return { deleted: true };
  }

  const registers = await PrismaDb.accountRegister.findMany({
    where: { accountId: { in: accountIds } },
    select: { id: true },
  });
  const registerIds = registers.map((r) => r.id);

  await PrismaDb.$transaction(async (tx) => {
    await tx.registerEntry.deleteMany({
      where: { accountRegisterId: { in: registerIds } },
    });

    const reoccurrences = await tx.reoccurrence.findMany({
      where: { accountId: { in: accountIds } },
      select: { id: true },
    });
    const reoccurrenceIds = reoccurrences.map((r) => r.id);

    await tx.reoccurrenceSplit.deleteMany({
      where: { reoccurrenceId: { in: reoccurrenceIds } },
    });
    await tx.reoccurrencePlaidNameAlias.deleteMany({
      where: { reoccurrenceId: { in: reoccurrenceIds } },
    });
    await tx.reoccurrenceSkip.deleteMany({
      where: { reoccurrenceId: { in: reoccurrenceIds } },
    });
    await tx.reoccurrence.deleteMany({
      where: { id: { in: reoccurrenceIds } },
    });

    await tx.savingsGoal.deleteMany({
      where: { accountId: { in: accountIds } },
    });

    const snapshots = await tx.accountSnapshot.findMany({
      where: { accountId: { in: accountIds } },
      select: { id: true },
    });
    const snapshotIds = snapshots.map((s) => s.id);
    const arSnaps = await tx.accountRegisterSnapshot.findMany({
      where: { snapshotId: { in: snapshotIds } },
      select: { id: true },
    });
    const arSnapIds = arSnaps.map((a) => a.id);
    await tx.registerEntrySnapshot.deleteMany({
      where: { registerSnapshotId: { in: arSnapIds } },
    });
    await tx.accountRegisterSnapshot.deleteMany({
      where: { snapshotId: { in: snapshotIds } },
    });
    await tx.accountSnapshot.deleteMany({
      where: { accountId: { in: accountIds } },
    });

    await tx.accountRegisterSummary.deleteMany({
      where: { accountRegisterId: { in: registerIds } },
    });

    await tx.category.deleteMany({
      where: { accountId: { in: accountIds } },
    });

    await tx.accountRegister.deleteMany({
      where: { id: { in: registerIds } },
    });

    await tx.budget.deleteMany({
      where: { userId: user.id },
    });

    await tx.accountInvite.deleteMany({
      where: { accountId: { in: accountIds } },
    });

    await tx.userAccount.deleteMany({
      where: { userId: user.id },
    });

    await tx.accountInvite.deleteMany({
      where: { invitedByUserId: user.id },
    });

    await tx.account.deleteMany({
      where: { id: { in: accountIds } },
    });

    await tx.plaidItem.deleteMany({
      where: { userId: user.id },
    });

    await tx.userSocial.deleteMany({
      where: { userId: user.id },
    });

    await tx.user.delete({
      where: { id: user.id },
    });
  });

  log({ message: "E2E user deleted", data: { email }, level: "info" });
  return { deleted: true };
}

/**
 * Create a fresh E2E user + workspace. Does not send signup emails.
 */
export async function seedE2EUser(): Promise<E2ESeedResult> {
  await deleteE2EUserByEmail(E2E_USER_EMAIL);

  const plainPassword = randomPassword();
  const hashedPassword = await new HashService().hash(plainPassword);

  const defaultCountryId =
    (
      await PrismaDb.country.findUnique({
        where: { id: 840 },
        select: { id: true },
      })
    )?.id ?? null;

  const now = dateTimeService.nowDate();
  const statementAt = now;

  const result = await PrismaDb.$transaction(async (prisma) => {
    const newUser = await prisma.user.create({
      data: {
        firstName: "E2E",
        lastName: "Test",
        email: E2E_USER_EMAIL,
        password: hashedPassword,
        countryId: defaultCountryId,
        settings: {},
        config: {},
      },
      select: { id: true },
    });
    const userId = newUser.id;

    const newAccount = await prisma.account.create({
      data: {
        name: "E2E Default",
        isDefault: true,
      },
      select: { id: true },
    });
    const accountId = newAccount.id;

    const newBudget = await prisma.budget.create({
      data: {
        name: "E2E Budget",
        userId,
        accountId,
        isDefault: true,
      },
      select: { id: true },
    });
    const budgetId = newBudget.id;

    await prisma.userAccount.create({
      data: { accountId, userId },
    });

    const checking = await prisma.accountRegister.create({
      data: {
        name: "E2E Checking",
        balance: 1000,
        latestBalance: 1000,
        statementAt,
        statementIntervalId: 3,
        account: { connect: { id: accountId } },
        type: { connect: { id: 1 } },
        budget: { connect: { id: budgetId } },
      },
      select: { id: true },
    });
    const checkingRegisterId = checking.id;

    await prisma.registerEntry.create({
      data: {
        accountRegisterId: checkingRegisterId,
        description: "Initial Balance",
        amount: 1000,
        balance: 1000,
        isBalanceEntry: true,
        isManualEntry: false,
        hasBalanceReCalc: true,
        createdAt: statementAt,
      },
    });

    const savings = await prisma.accountRegister.create({
      data: {
        name: "E2E Savings",
        balance: 0,
        latestBalance: 0,
        statementAt,
        statementIntervalId: 3,
        account: { connect: { id: accountId } },
        type: { connect: { id: 1 } },
        budget: { connect: { id: budgetId } },
      },
      select: { id: true },
    });
    const savingsRegisterId = savings.id;

    await prisma.registerEntry.create({
      data: {
        accountRegisterId: savingsRegisterId,
        description: "Initial Balance",
        amount: 0,
        balance: 0,
        isBalanceEntry: true,
        isManualEntry: false,
        hasBalanceReCalc: true,
        createdAt: statementAt,
      },
    });

    const category = await prisma.category.create({
      data: {
        name: "E2E Groceries",
        accountId,
        isArchived: false,
      },
      select: { id: true },
    });
    const categoryId = category.id;

    await prisma.registerEntry.create({
      data: {
        accountRegisterId: checkingRegisterId,
        description: "E2E seeded transaction",
        amount: -25.5,
        balance: 974.5,
        isManualEntry: true,
        hasBalanceReCalc: true,
        categoryId,
        createdAt: statementAt,
      },
    });

    const reoccurrence = await prisma.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checkingRegisterId,
        intervalId: 3,
        intervalCount: 1,
        amount: -50,
        description: "E2E Monthly Bill",
        lastAt: now,
        categoryId,
      },
      select: { id: true },
    });
    const reoccurrenceId = reoccurrence.id;

    const savingsGoal = await prisma.savingsGoal.create({
      data: {
        accountId,
        budgetId,
        name: "E2E Emergency Fund",
        targetAmount: 500,
        sourceAccountRegisterId: checkingRegisterId,
        targetAccountRegisterId: savingsRegisterId,
        categoryId,
        sortOrder: 0,
      },
      select: { id: true },
    });
    const savingsGoalId = savingsGoal.id;

    return {
      userId,
      budgetId,
      accountId,
      checkingRegisterId,
      savingsRegisterId,
      categoryId,
      reoccurrenceId,
      savingsGoalId,
    };
  });

  log({
    message: "E2E user seeded",
    data: { email: E2E_USER_EMAIL, userId: result.userId },
    level: "info",
  });

  return {
    email: E2E_USER_EMAIL,
    password: plainPassword,
    ...result,
  };
}
