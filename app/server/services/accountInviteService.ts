import { createHash, randomBytes } from "node:crypto";
import { createError } from "h3";
import type { H3Event } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { assertUserHasAccountAccess } from "~/server/lib/accountAccess";
import { findUserByEmail } from "~/server/lib/findUserByEmail";
import { completeLogin } from "~/server/lib/completeLogin";
import HashService from "~/server/services/HashService";
import { dateTimeService } from "~/server/services/forecast";
import { log } from "~/server/logger";
import { postmarkClient, hasPostmarkToken } from "~/server/clients/postmarkClient";
import env from "~/server/env";

export const INVITE_EXPIRY_DAYS = 7;
const MAX_PENDING_INVITES_PER_ACCOUNT = 50;
const MAX_INVITES_PER_HOUR_PER_USER = 30;

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
  const base = (env?.NUXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}/accept-invite?token=${encodeURIComponent(rawToken)}`;
}

async function sendInviteEmail(params: {
  toEmail: string;
  accountName: string;
  inviterDisplayName: string;
  rawToken: string;
  expiresAt: Date;
}) {
  const { toEmail, accountName, inviterDisplayName, rawToken, expiresAt } =
    params;
  const link = buildInviteUrl(rawToken);
  const isLocal = env?.DEPLOY_ENV === "local";
  const html = `${inviterDisplayName} invited you to collaborate on the Dineros account <strong>${escapeHtml(
    accountName,
  )}</strong>.<br><br>
<a href="${link}">Accept invitation</a><br><br>
This link expires on ${expiresAt.toUTCString()}.<br><br>
If you did not expect this email, you can ignore it.`;

  if (hasPostmarkToken && !isLocal) {
    await postmarkClient.sendEmail({
      From: "Mr. Pepe Dineros <pepe@dineros.cc>",
      To: toEmail,
      Subject: `You're invited to ${accountName} on Dineros`,
      HtmlBody: html,
    });
  } else {
    log({
      message: "[ACCOUNT_INVITE] Email not sent (local or no Postmark token)",
      level: "info",
      data: { toEmail, inviteUrl: link },
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function createAccountInvite(params: {
  inviterUserId: number;
  accountId: string;
  email: string;
}) {
  const { inviterUserId, accountId } = params;
  const email = normalizeInviteEmail(params.email);

  if (!email.includes("@")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid email" });
  }

  await assertUserHasAccountAccess(inviterUserId, accountId);

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
    const link = await prisma.userAccount.findFirst({
      where: { userId: inviteeUser.id, accountId },
    });
    if (link) {
      throw createError({
        statusCode: 409,
        statusMessage: "This user already has access to the account.",
      });
    }
  }

  const pendingCount = await prisma.accountInvite.count({
    where: { accountId, acceptedAt: null, revokedAt: null },
  });
  if (pendingCount >= MAX_PENDING_INVITES_PER_ACCOUNT) {
    throw createError({
      statusCode: 400,
      statusMessage: "Too many pending invites for this account. Revoke some first.",
    });
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

  await prisma.accountInvite.updateMany({
    where: {
      accountId,
      email,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: dateTimeService.nowDate() },
  });

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = dateTimeService.add(INVITE_EXPIRY_DAYS, "day").toDate();

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { name: true },
  });

  const inviterDisplayName =
    [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") ||
    "A teammate";

  const row = await prisma.accountInvite.create({
    data: {
      accountId,
      email,
      invitedByUserId: inviterUserId,
      tokenHash,
      expiresAt,
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
    },
  });

  await sendInviteEmail({
    toEmail: email,
    accountName: account.name,
    inviterDisplayName,
    rawToken,
    expiresAt: row.expiresAt,
  });

  return { id: row.id, email: row.email, expiresAt: row.expiresAt };
}

export async function listPendingInvitesForAccount(params: {
  userId: number;
  accountId: string;
}) {
  const { userId, accountId } = params;
  await assertUserHasAccountAccess(userId, accountId);
  const now = dateTimeService.nowDate();
  return prisma.accountInvite.findMany({
    where: {
      accountId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true,
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
  });
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: "Invite not found" });
  }
  await assertUserHasAccountAccess(userId, invite.accountId);
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
      account: { select: { name: true } },
      invitedBy: { select: { firstName: true, lastName: true } },
    },
  });
  const now = dateTimeService.nowDate();
  if (
    !invite ||
    invite.revokedAt ||
    invite.acceptedAt ||
    invite.expiresAt < now
  ) {
    return { valid: false as const };
  }

  const u = await findUserByEmail(invite.email);
  const needsPassword = !u || !u.password;
  const needsName = !u;

  return {
    valid: true as const,
    accountName: invite.account.name,
    inviterDisplayName:
      [invite.invitedBy.firstName, invite.invitedBy.lastName]
        .filter(Boolean)
        .join(" ") || "A teammate",
    expiresAt: invite.expiresAt.toISOString(),
    needsPassword,
    needsName,
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
      account: { select: { id: true, name: true } },
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
    const existing = await tx.userAccount.findFirst({
      where: { userId, accountId: invite.accountId },
    });
    if (!existing) {
      await tx.userAccount.create({
        data: { userId, accountId: invite.accountId },
      });
    }
    await tx.accountInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: now },
    });
  });

  return completeLogin(event, userId);
}
