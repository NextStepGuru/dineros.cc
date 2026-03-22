import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import {
  hasPostmarkToken,
  postmarkClient,
} from "~/server/clients/postmarkClient";
import env from "~/server/env";
import { log } from "~/server/logger";
import { dateTimeService } from "./forecast/DateTimeService";

export type RegisterSyncStatsRow = {
  accountRegisterId: number;
  name: string;
  newCount: number;
  updatedCount: number;
};

type UserSettingsShape = {
  plaid?: {
    /** When false, skip Plaid sync summary emails. Default true (unset = send). */
    transactionSyncEmail?: boolean;
    /** When false, skip emails when the bank connection needs attention. Default true (unset = send). */
    connectionIssueEmail?: boolean;
    lastConnectionIssueEmailAt?: string;
  };
};

const CONNECTION_ISSUE_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function userWantsPlaidSyncEmail(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return true;
  const s = settings as UserSettingsShape;
  if (s.plaid?.transactionSyncEmail === false) return false;
  return true;
}

function userWantsPlaidConnectionIssueEmail(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return true;
  const s = settings as UserSettingsShape;
  if (s.plaid?.connectionIssueEmail === false) return false;
  return true;
}

function connectionIssueEmailCooldownOk(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return true;
  const raw = (settings as UserSettingsShape).plaid?.lastConnectionIssueEmailAt;
  if (typeof raw !== "string" || raw.length === 0) return true;
  const last = Date.parse(raw);
  if (Number.isNaN(last)) return true;
  return (
    dateTimeService.nowDate().getTime() - last >=
    CONNECTION_ISSUE_EMAIL_COOLDOWN_MS
  );
}

/**
 * Sends a single digest after Plaid transaction sync completes for an Item or access-token batch.
 * Only call when total new transactions &gt; 0 (see callers).
 */
export async function sendPlaidSyncSummaryEmail({
  userId,
  itemId,
  registers,
}: {
  userId: number;
  itemId?: string;
  registers: RegisterSyncStatsRow[];
}): Promise<void> {
  if (registers.length === 0) return;

  const user = await PrismaDb.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      firstName: true,
      settings: true,
    },
  });

  if (!user?.email) {
    log({
      message: "Plaid sync summary email: no user email",
      data: { userId },
      level: "warn",
    });
    return;
  }

  if (!userWantsPlaidSyncEmail(user.settings)) {
    return;
  }

  const isLocal = env?.DEPLOY_ENV === "local";
  if (!hasPostmarkToken || isLocal) {
    log({
      message:
        "[PLAID_SYNC_EMAIL] Summary not sent (local or no Postmark token)",
      level: "info",
      data: {
        userId,
        itemId,
        registers,
        to: user.email,
      },
    });
    return;
  }

  const baseUrl = env?.NUXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const registersUrl = `${baseUrl}/account-registers`;
  const greeting = user.firstName?.trim() ? `${user.firstName},` : "Hi,";

  const rowsHtml = registers
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(
          r.name || "Account",
        )}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${r.newCount} new</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${r.updatedCount} updated</td></tr>`,
    )
    .join("");

  const itemNote = itemId
    ? `<p style="color:#666;font-size:14px;">Bank connection sync completed.</p>`
    : "";

  const html = `${greeting}<br><br>
We finished syncing your linked bank accounts and added new transactions to Dineros.<br>
${itemNote}
<table style="border-collapse:collapse;width:100%;max-width:480px;margin:16px 0;">
<thead><tr><th style="text-align:left;padding:8px 12px;border-bottom:2px solid #ccc;">Account</th><th style="text-align:right;padding:8px 12px;border-bottom:2px solid #ccc;">New</th><th style="text-align:right;padding:8px 12px;border-bottom:2px solid #ccc;">Updated</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
<p><a href="${registersUrl}">Open account registers</a></p>
<br>
Regards,<br>
&nbsp;&nbsp;Mr. Pepe &amp; The Dineros Team
`;

  await postmarkClient.sendEmail({
    From: "Mr. Pepe Dineros <pepe@dineros.cc>",
    To: user.email,
    Subject: "New bank transactions synced in Dineros",
    HtmlBody: html,
  });
}

/**
 * Email when Plaid signals the Item needs re-authentication. Returns true if an email was sent.
 * Respects opt-out, Postmark/local, and a 24h cooldown per user (stored in settings.plaid.lastConnectionIssueEmailAt).
 */
export async function sendPlaidConnectionIssueEmailIfEligible({
  userId,
  itemId,
  webhookCode,
}: {
  userId: number;
  itemId: string;
  webhookCode: string;
}): Promise<boolean> {
  const user = await PrismaDb.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      firstName: true,
      settings: true,
    },
  });

  if (!user?.email) {
    log({
      message: "Plaid connection issue email: no user email",
      data: { userId, itemId },
      level: "warn",
    });
    return false;
  }

  if (!userWantsPlaidConnectionIssueEmail(user.settings)) {
    return false;
  }

  if (!connectionIssueEmailCooldownOk(user.settings)) {
    log({
      message:
        "[PLAID_CONNECTION_EMAIL] Skipped (within 24h cooldown of last send)",
      level: "debug",
      data: { userId, itemId },
    });
    return false;
  }

  const isLocal = env?.DEPLOY_ENV === "local";
  if (!hasPostmarkToken || isLocal) {
    log({
      message:
        "[PLAID_CONNECTION_EMAIL] Not sent (local or no Postmark token)",
      level: "info",
      data: { userId, itemId, webhookCode, to: user.email },
    });
    return false;
  }

  const baseUrl = env?.NUXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const syncAccountsUrl = `${baseUrl}/edit-profile/sync-accounts`;
  const greeting = user.firstName?.trim() ? `${user.firstName},` : "Hi,";
  const codeLine = escapeHtml(webhookCode);

  const html = `${greeting}<br><br>
Your bank connection in Dineros needs attention. Plaid reported: <strong>${codeLine}</strong>.<br><br>
Please reconnect your bank in Dineros so we can keep importing transactions.<br><br>
<p><a href="${syncAccountsUrl}">Open Sync accounts</a></p>
<br>
Regards,<br>
&nbsp;&nbsp;Mr. Pepe &amp; The Dineros Team
`;

  await postmarkClient.sendEmail({
    From: "Mr. Pepe Dineros <pepe@dineros.cc>",
    To: user.email,
    Subject: "Action needed: reconnect your bank in Dineros",
    HtmlBody: html,
  });

  return true;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
