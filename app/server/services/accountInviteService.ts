import { createHash, randomBytes } from "node:crypto";
import { createError } from "h3";
import type { H3Event } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { findUserByEmail } from "~/server/lib/findUserByEmail";
import { completeLogin } from "~/server/lib/completeLogin";
import HashService from "~/server/services/HashService";
import { dateTimeService } from "~/server/services/forecast";
import { log } from "~/server/logger";
import { postmarkClient, hasPostmarkToken } from "~/server/clients/postmarkClient";
import env from "~/server/env";
import { buildAppUrl } from "~/server/lib/appUrl";
import {
  assertAccountCapability,
  parseAllowedBudgetIds,
} from "~/server/lib/accountMembership";
import type { Prisma } from "@prisma/client";

export const INVITE_EXPIRY_DAYS = 7;
const MAX_PENDING_INVITES_PER_ACCOUNT = 50;
const MAX_INVITES_PER_HOUR_PER_USER = 30;

export type InvitePermissionInput = {
  canViewBudgets: boolean;
  canInviteUsers: boolean;
  canManageMembers: boolean;
  allowedBudgetIds?: number[] | null;
};

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildInviteUrl(rawToken: string): string {
  const inviteUrl = buildAppUrl(
    `/accept-invite?token=${encodeURIComponent(rawToken)}`,
  );
  if (inviteUrl) {
    return inviteUrl;
  }
  throw createError({
    statusCode: 500,
    statusMessage: "Invite URL is not configured for this environment.",
  });
}

async function sendInviteEmail(params: {
  toEmail: string;
  accountNames: string[];
  inviterDisplayName: string;
  inviteUrl: string;
  expiresAt: Date;
}) {
  const { toEmail, accountNames, inviterDisplayName, inviteUrl, expiresAt } =
    params;
  const isLocal = env?.DEPLOY_ENV === "local";
  const namesLabel =
    accountNames.length === 1
      ? accountNames[0]
      : `${accountNames.length} accounts (${accountNames.join(", ")})`;
  const html = `${inviterDisplayName} invited you to collaborate on ${accountNames.length === 1 ? "the Dineros account" : "these Dineros accounts"} <strong>${escapeHtml(
    namesLabel,
  )}</strong>.<br><br>
<a href="${inviteUrl}">Accept invitation</a><br><br>
This link expires on ${expiresAt.toUTCString()}.<br><br>
If you did not expect this email, you can ignore it.`;

  if (hasPostmarkToken && !isLocal) {
    await postmarkClient.sendEmail({
      From: "Mr. Pepe Dineros <pepe@dineros.cc>",
      To: toEmail,
      Subject:
        accountNames.length === 1
          ? `You're invited to ${accountNames[0]} on Dineros`
          : `You're invited to ${accountNames.length} accounts on Dineros`,
      HtmlBody: html,
    });
  } else {
    log({
      message: "[ACCOUNT_INVITE] Email not sent (local or no Postmark token)",
      level: "info",
      data: { toEmail, inviteUrl },
    });
  }
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function createAccountInvite(params: {
  inviterUserId: number;
  accountIds: string[];
  email: string;
  permissions: InvitePermissionInput;
}) {
  const { inviterUserId, permissions } = params;
  const email = normalizeInviteEmail(params.email);
  const accountIds = [...new Set(params.accountIds)];

  if (!email.includes("@")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid email" });
  }
  if (accountIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "No accounts selected." });
  }

  for (const accountId of accountIds) {
    await assertAccountCapability(inviterUserId, accountId, "canInviteUsers");
  }

  const inviter = await prisma.user.findUniqueOrThrow({
    where: { id: inviterUserId },
    select: { email: true, firstName: true, lastName: true },
  });
  const inviterEmailNorm = normalizeInviteEmail(inviter.email ?? "");
  if (email === inviterEmailNorm) {
    throw createError({
      statusCode: 400,
      statusMessage: "You cannot invite your own email address.",
    });
  }

  const inviteeUser = await findUserByEmail(email);
  if (inviteeUser) {
    for (const accountId of accountIds) {
      const link = await prisma.userAccount.findFirst({
        where: { userId: inviteeUser.id, accountId },
      });
      if (link) {
        throw createError({
          statusCode: 409,
          statusMessage: `This user already has access to an account you selected.`,
        });
      }
    }
  }

  const now = dateTimeService.nowDate();
  for (const accountId of accountIds) {
    const pendingCount = await prisma.accountInvite.count({
      where: {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
        inviteAccounts: { some: { accountId } },
      },
    });
    if (pendingCount >= MAX_PENDING_INVITES_PER_ACCOUNT) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "Too many pending invites for one of the selected accounts. Revoke some first.",
      });
    }
  }

  const oneHourAgo = dateTimeService.add(-1, "hour").toDate();
  const recentCount = await prisma.accountInvite.count({
    where: {
      invitedByUserId: inviterUserId,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recentCount >= MAX_INVITES_PER_HOUR_PER_USER) {
    throw createError({
      statusCode: 429,
      statusMessage: "Too many invites sent. Try again later.",
    });
  }

  const overlapping = await prisma.accountInvite.findMany({
    where: {
      email,
      acceptedAt: null,
      revokedAt: null,
      inviteAccounts: { some: { accountId: { in: accountIds } } },
    },
    select: { id: true },
  });
  if (overlapping.length > 0) {
    await prisma.accountInvite.updateMany({
      where: { id: { in: overlapping.map((o) => o.id) } },
      data: { revokedAt: dateTimeService.nowDate() },
    });
  }

  const rawToken = generateInviteToken();
  const inviteUrl = buildInviteUrl(rawToken);
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = dateTimeService.add(INVITE_EXPIRY_DAYS, "day").toDate();

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, name: true },
  });
  if (accounts.length !== accountIds.length) {
    throw createError({ statusCode: 400, statusMessage: "Invalid account id." });
  }

  const inviterDisplayName =
    [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") ||
    "A teammate";

  const abForDb: Prisma.InputJsonValue | typeof Prisma.JsonNull =
    permissions.allowedBudgetIds === undefined ||
    permissions.allowedBudgetIds === null
      ? Prisma.JsonNull
      : (permissions.allowedBudgetIds as Prisma.InputJsonValue);

  const row = await prisma.accountInvite.create({
    data: {
      email,
      invitedByUserId: inviterUserId,
      tokenHash,
      expiresAt,
      inviteAccounts: {
        create: accountIds.map((accountId) => ({
          accountId,
          canViewBudgets: permissions.canViewBudgets,
          canInviteUsers: permissions.canInviteUsers,
          canManageMembers: permissions.canManageMembers,
          allowedBudgetIds: abForDb,
        })),
      },
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
    },
  });

  await sendInviteEmail({
    toEmail: email,
    accountNames: accounts.map((a) => a.name),
    inviterDisplayName,
    inviteUrl,
    expiresAt: row.expiresAt,
  });

  return { id: row.id, email: row.email, expiresAt: row.expiresAt };
}

export async function listPendingInvitesForAccount(params: {
  userId: number;
  accountId: string;
}) {
  const { userId, accountId } = params;
  await assertAccountCapability(userId, accountId, "canInviteUsers");
  const now = dateTimeService.nowDate();
  return prisma.accountInvite.findMany({
    where: {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
      inviteAccounts: { some: { accountId } },
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true,
      inviteAccounts: {
        select: {
          account: { select: { id: true, name: true } },
          canViewBudgets: true,
          canInviteUsers: true,
          canManageMembers: true,
        },
      },
      invitedBy: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeAccountInvite(params: {
  userId: number;
  inviteId: number;
}) {
  const { userId, inviteId } = params;
  const invite = await prisma.accountInvite.findFirst({
    where: { id: inviteId },
    include: { inviteAccounts: { select: { accountId: true } } },
  });
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: "Invite not found" });
  }
  for (const ia of invite.inviteAccounts) {
    await assertAccountCapability(userId, ia.accountId, "canInviteUsers");
  }
  if (invite.acceptedAt || invite.revokedAt) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invite is no longer pending",
    });
  }
  await prisma.accountInvite.update({
    where: { id: inviteId },
    data: { revokedAt: dateTimeService.nowDate() },
  });
  return { ok: true as const };
}

export async function getInviteValidationPayload(token: string) {
  const th = hashInviteToken(token.trim());
  const invite = await prisma.accountInvite.findFirst({
    where: { tokenHash: th },
    include: {
      inviteAccounts: {
        include: { account: { select: { name: true, id: true } } },
      },
      invitedBy: { select: { firstName: true, lastName: true } },
    },
  });
  const now = dateTimeService.nowDate();
  if (
    !invite ||
    invite.revokedAt ||
    invite.acceptedAt ||
    invite.expiresAt < now ||
    invite.inviteAccounts.length === 0
  ) {
    return { valid: false as const };
  }

  const u = await findUserByEmail(invite.email);
  const needsPassword = !u || !u.password;
  const needsName = !u;

  const first = invite.inviteAccounts[0]!;
  const accounts = invite.inviteAccounts.map((ia) => ({
    id: ia.account.id,
    name: ia.account.name,
  }));
  const accountNameLabel =
    accounts.length === 1
      ? accounts[0]!.name
      : `${accounts.length} accounts`;

  return {
    valid: true as const,
    accounts,
    accountName: accountNameLabel,
    inviterDisplayName:
      [invite.invitedBy.firstName, invite.invitedBy.lastName]
        .filter(Boolean)
        .join(" ") || "A teammate",
    expiresAt: invite.expiresAt.toISOString(),
    needsPassword,
    needsName,
    permissions: {
      canViewBudgets: first.canViewBudgets,
      canInviteUsers: first.canInviteUsers,
      canManageMembers: first.canManageMembers,
      allowedBudgetIds: parseAllowedBudgetIds(first.allowedBudgetIds),
    },
  };
}

export async function acceptAccountInvite(
  event: H3Event,
  body: {
    token: string;
    firstName?: string;
    lastName?: string;
    password?: string;
    confirmPassword?: string;
  },
) {
  const token = body.token?.trim();
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: "Token is required" });
  }

  const tokenHash = hashInviteToken(token);
  const invite = await prisma.accountInvite.findFirst({
    where: { tokenHash },
    include: {
      inviteAccounts: true,
    },
  });

  const now = dateTimeService.nowDate();
  if (!invite) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid or expired invite",
    });
  }
  if (invite.revokedAt || invite.acceptedAt || invite.expiresAt < now) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid or expired invite",
    });
  }

  const inviteEmail = invite.email;
  let user = await findUserByEmail(inviteEmail);

  if (!user) {
    const fn = body.firstName?.trim();
    const ln = body.lastName?.trim();
    const pw = body.password;
    const cp = body.confirmPassword;
    if (!fn || !ln) {
      throw createError({
        statusCode: 400,
        statusMessage: "First and last name are required",
      });
    }
    if (!pw || pw.length < 6) {
      throw createError({
        statusCode: 400,
        statusMessage: "Password must be at least 6 characters",
      });
    }
    if (pw !== cp) {
      throw createError({
        statusCode: 400,
        statusMessage: "Passwords do not match",
      });
    }
    const hashedPassword = await new HashService().hash(pw);
    const defaultCountryId =
      (await prisma.country.findUnique({ where: { id: 840 }, select: { id: true } }))
        ?.id ?? null;

    user = await prisma.user.create({
      data: {
        firstName: fn,
        lastName: ln,
        email: inviteEmail,
        password: hashedPassword,
        countryId: defaultCountryId,
        settings: {},
        config: {},
      },
    });
  } else {
    if (!user.password) {
      const pw = body.password;
      const cp = body.confirmPassword;
      if (!pw || pw.length < 6) {
        throw createError({
          statusCode: 400,
          statusMessage: "Password is required",
        });
      }
      if (pw !== cp) {
        throw createError({
          statusCode: 400,
          statusMessage: "Passwords do not match",
        });
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { password: await new HashService().hash(pw) },
      });
    }
    const fn = body.firstName?.trim();
    const ln = body.lastName?.trim();
    if (fn || ln) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(fn ? { firstName: fn } : {}),
          ...(ln ? { lastName: ln } : {}),
        },
      });
    }
  }

  const userId = user.id;

  await prisma.$transaction(async (tx) => {
    for (const target of invite.inviteAccounts) {
      const existing = await tx.userAccount.findFirst({
        where: { userId, accountId: target.accountId },
      });
      const data = {
        canViewBudgets: target.canViewBudgets,
        canInviteUsers: target.canInviteUsers,
        canManageMembers: target.canManageMembers,
        allowedBudgetIds:
          target.allowedBudgetIds == null
            ? Prisma.JsonNull
            : (target.allowedBudgetIds as Prisma.InputJsonValue),
      };
      if (!existing) {
        await tx.userAccount.create({
          data: {
            userId,
            accountId: target.accountId,
            ...data,
          },
        });
      } else {
        await tx.userAccount.update({
          where: { id: existing.id },
          data,
        });
      }
    }
    await tx.accountInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: now },
    });
  });

  return completeLogin(event, userId);
}
