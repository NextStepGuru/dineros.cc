import { createError } from "h3";
import type { Prisma } from "@prisma/client";
import { prisma } from "~/server/clients/prismaClient";
import {
  assertAccountCapability,
  parseAllowedAccountRegisterIds,
} from "~/server/lib/accountMembership";
import { assertUserCanAssignRegisterScopeForAccounts } from "~/server/services/accountInviteService";
import type { InvitePermissionInput } from "~/server/services/accountInviteService";

export async function listAccountMembers(params: {
  actorUserId: number;
  accountId: string;
}) {
  const { actorUserId, accountId } = params;
  await assertAccountCapability(actorUserId, accountId, "canInviteUsers");

  const rows = await prisma.userAccount.findMany({
    where: { accountId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { userId: "asc" },
  });

  return rows.map((r) => ({
    userId: r.userId,
    email: r.user.email,
    firstName: r.user.firstName,
    lastName: r.user.lastName,
    canViewBudgets: r.canViewBudgets,
    canInviteUsers: r.canInviteUsers,
    canManageMembers: r.canManageMembers,
    allowedBudgetIds: r.allowedBudgetIds,
    allowedAccountRegisterIds: parseAllowedAccountRegisterIds(
      r.allowedAccountRegisterIds,
    ),
  }));
}

async function assertNotLastOnlyManager(
  accountId: string,
  targetUserId: number,
): Promise<void> {
  const members = await prisma.userAccount.findMany({
    where: { accountId },
    select: { userId: true, canManageMembers: true },
  });
  const managers = members.filter((m) => m.canManageMembers);
  if (
    managers.length === 1 &&
    managers[0]!.userId === targetUserId
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Cannot remove the only member who can manage members for this account.",
    });
  }
}

export async function removeAccountMember(params: {
  actorUserId: number;
  accountId: string;
  targetUserId: number;
}) {
  const { actorUserId, accountId, targetUserId } = params;
  await assertAccountCapability(actorUserId, accountId, "canManageMembers");

  const target = await prisma.userAccount.findFirst({
    where: { accountId, userId: targetUserId },
  });
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: "Member not found" });
  }

  await assertNotLastOnlyManager(accountId, targetUserId);

  await prisma.userAccount.delete({
    where: { id: target.id },
  });
  return { ok: true as const };
}

export async function updateAccountMemberCapabilities(params: {
  actorUserId: number;
  accountId: string;
  targetUserId: number;
  permissions: InvitePermissionInput;
}) {
  const { actorUserId, accountId, targetUserId, permissions } = params;
  await assertAccountCapability(actorUserId, accountId, "canManageMembers");

  const target = await prisma.userAccount.findFirst({
    where: { accountId, userId: targetUserId },
  });
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: "Member not found" });
  }

  if (!permissions.canManageMembers) {
    await assertNotLastOnlyManager(accountId, targetUserId);
  }

  await assertUserCanAssignRegisterScopeForAccounts(
    actorUserId,
    [accountId],
    permissions.allowedAccountRegisterIds,
  );

  await prisma.userAccount.update({
    where: { id: target.id },
    data: {
      canViewBudgets: permissions.canViewBudgets,
      canInviteUsers: permissions.canInviteUsers,
      canManageMembers: permissions.canManageMembers,
      ...(permissions.allowedBudgetIds !== undefined
        ? {
            allowedBudgetIds:
              permissions.allowedBudgetIds === null
                ? Prisma.JsonNull
                : (permissions.allowedBudgetIds as Prisma.InputJsonValue),
          }
        : {}),
      ...(permissions.allowedAccountRegisterIds !== undefined
        ? {
            allowedAccountRegisterIds:
              permissions.allowedAccountRegisterIds === null
                ? Prisma.JsonNull
                : (permissions.allowedAccountRegisterIds as Prisma.InputJsonValue),
          }
        : {}),
    },
  });
  return { ok: true as const };
}
