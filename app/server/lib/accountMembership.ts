import { createError } from "h3";
import type { H3Event } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";

export type AccountCapability =
  | "canViewBudgets"
  | "canInviteUsers"
  | "canManageMembers";

export type AccountMembershipRow = {
  userId: number;
  accountId: string;
  canViewBudgets: boolean;
  canInviteUsers: boolean;
  canManageMembers: boolean;
  allowedBudgetIds: unknown | null;
};

/** Normalize JSON column to sorted unique budget ids, or null = all budgets (when canViewBudgets). */
export function parseAllowedBudgetIds(
  raw: unknown | null | undefined,
): number[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const nums = raw
    .map((x) => (typeof x === "number" ? x : Number(x)))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (nums.length === 0) return [];
  return [...new Set(nums)].sort((a, b) => a - b);
}

export function budgetAllowedForMembership(
  membership: Pick<
    AccountMembershipRow,
    "canViewBudgets" | "allowedBudgetIds"
  >,
  budgetId: number,
): boolean {
  if (!membership.canViewBudgets) return false;
  const allowed = parseAllowedBudgetIds(membership.allowedBudgetIds);
  if (allowed === null) return true;
  return allowed.includes(budgetId);
}

export async function getMembership(
  userId: number,
  accountId: string,
): Promise<AccountMembershipRow | null> {
  const row = await prisma.userAccount.findFirst({
    where: { userId, accountId },
    select: {
      userId: true,
      accountId: true,
      canViewBudgets: true,
      canInviteUsers: true,
      canManageMembers: true,
      allowedBudgetIds: true,
    },
  });
  return row;
}

/** All account links for a user (for lists / client). */
export async function loadMembershipsForUser(
  userId: number,
): Promise<AccountMembershipRow[]> {
  return prisma.userAccount.findMany({
    where: { userId },
    select: {
      userId: true,
      accountId: true,
      canViewBudgets: true,
      canInviteUsers: true,
      canManageMembers: true,
      allowedBudgetIds: true,
    },
  });
}

export async function assertAccountCapability(
  userId: number,
  accountId: string,
  capability: AccountCapability,
): Promise<AccountMembershipRow> {
  const row = await getMembership(userId, accountId);
  if (!row) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  if (!row[capability]) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  return row;
}

export async function assertAccountCapabilityFromEvent(
  event: H3Event,
  accountId: string,
  capability: AccountCapability,
): Promise<AccountMembershipRow> {
  const { userId } = getUser(event);
  return assertAccountCapability(userId, accountId, capability);
}

/** Load budget and enforce membership + allowedBudgetIds. */
export async function assertBudgetVisibleToUser(
  userId: number,
  budgetId: number,
): Promise<{ id: number; accountId: string; isDefault: boolean }> {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, isArchived: false },
    select: { id: true, accountId: true, isDefault: true },
  });
  if (!budget) {
    throw createError({ statusCode: 404, statusMessage: "Budget not found" });
  }
  const m = await getMembership(userId, budget.accountId);
  if (!m || !budgetAllowedForMembership(m, budget.id)) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  return budget;
}
