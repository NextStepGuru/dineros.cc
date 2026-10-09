import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import {
  hasPostmarkToken,
  postmarkClient,
} from "~/server/clients/postmarkClient";
import env from "~/server/env";
import { buildAppUrl } from "~/server/lib/appUrl";
import { log } from "~/server/logger";
import { dateTimeService } from "./forecast/DateTimeService";
import {
  formatSignedUsd,
  type RegisterSyncCategoryChangeRecord,
  type RegisterSyncTxRecord,
} from "./PlaidSyncDetailCollector";

export type RegisterSyncStatsRow = {
  accountRegisterId: number;
  name: string;
  newCount: number;
  updatedCount: number;
  /** Entries created during this sync — renders the new-transaction table. */
  newRecords?: RegisterSyncTxRecord[];
  /** Entries updated during this sync with a change note. */
  updatedRecords?: RegisterSyncTxRecord[];
  /** Category assignments changed automatically during this sync. */
  categoryChanges?: RegisterSyncCategoryChangeRecord[];
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

  const registersUrl = buildAppUrl("/account-registers");
  const greeting = user.firstName?.trim() ? `${user.firstName},` : "Hi,";

  const rowsHtml = registers
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(
          r.name || "Account",
        )}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${r.newCount} new</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${r.updatedCount} updated</td></tr>`,
    )
    .join("");

  let detailData: Map<number, ResolvedRegisterDetails> | null = null;
  try {
    detailData = await resolveSyncDetails(registers);
  } catch (err) {
    log({
      message:
        "Plaid sync summary email: failed to load transaction details, sending counts only",
      data: { userId, itemId, err: err instanceof Error ? err.message : String(err) },
      level: "warn",
    });
  }

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
${detailData ? buildDetailSectionsHtml(registers, detailData) : ""}
${registersUrl ? `<p><a href="${registersUrl}">Open account registers</a></p>` : "<p>Open Dineros and visit Account registers.</p>"}
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

type DecimalLike = number | string | { toNumber(): number };

type DetailEntry = {
  id: string;
  createdAt: Date;
  description: string;
  amount: DecimalLike;
  isPending: boolean;
  categoryName: string | null;
};

type ResolvedUpdatedTx = { entry: DetailEntry; note?: string };

type ResolvedCategoryChange = {
  entry: DetailEntry;
  fromCategoryName: string | null;
  toCategoryName: string;
  source: string | null;
};

type ResolvedRegisterDetails = {
  newTxs: DetailEntry[];
  updatedTxs: ResolvedUpdatedTx[];
  categoryChanges: ResolvedCategoryChange[];
};

const MAX_DETAIL_ROWS = 20;

const CATEGORY_SOURCE_LABELS: Record<string, string> = {
  ai: "AI",
  rule: "merchant rule",
  pfc: "bank category",
  recurrence: "recurring template",
};

const MONTH_ABBREVS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function decimalToNumber(v: DecimalLike): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return v.toNumber();
}

function formatEntryDate(d: Date): string {
  const ymd = dateTimeService.formatInTimezone(d, "UTC", "YYYY-MM-DD");
  const [, month, day] = ymd.split("-").map(Number);
  return `${MONTH_ABBREVS[(month ?? 1) - 1] ?? "?"} ${day ?? "?"}`;
}

function categorySourceLabel(source: string | null): string | null {
  if (!source) return null;
  return CATEGORY_SOURCE_LABELS[source] ?? null;
}

/**
 * Resolves sync-detail records into display data: one batched query for the
 * register entries (encrypted descriptions decrypt via the client extension)
 * and one for the category names involved.
 */
async function resolveSyncDetails(
  registers: RegisterSyncStatsRow[],
): Promise<Map<number, ResolvedRegisterDetails> | null> {
  const entryIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const r of registers) {
    for (const rec of r.newRecords ?? []) entryIds.add(rec.entryId);
    for (const rec of r.updatedRecords ?? []) entryIds.add(rec.entryId);
    for (const change of r.categoryChanges ?? []) {
      entryIds.add(change.entryId);
      categoryIds.add(change.toCategoryId);
      if (change.fromCategoryId) categoryIds.add(change.fromCategoryId);
    }
  }
  if (entryIds.size === 0) return null;

  const entries = await PrismaDb.registerEntry.findMany({
    where: { id: { in: [...entryIds] } },
    select: {
      id: true,
      createdAt: true,
      description: true,
      amount: true,
      isPending: true,
      category: { select: { name: true } },
    },
  });
  const entryById = new Map<string, DetailEntry>(
    entries.map((e) => [
      e.id,
      {
        id: e.id,
        createdAt: e.createdAt,
        description: e.description,
        amount: e.amount,
        isPending: e.isPending,
        categoryName: e.category?.name ?? null,
      },
    ]),
  );

  const categories =
    categoryIds.size > 0
      ? await PrismaDb.category.findMany({
          where: { id: { in: [...categoryIds] } },
          select: { id: true, name: true },
        })
      : [];
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const resolved = new Map<number, ResolvedRegisterDetails>();
  for (const r of registers) {
    const newTxs = (r.newRecords ?? [])
      .map((rec) => entryById.get(rec.entryId))
      .filter((e): e is DetailEntry => Boolean(e))
      .sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    const updatedTxs = (r.updatedRecords ?? []).flatMap((rec) => {
      const entry = entryById.get(rec.entryId);
      return entry ? [{ entry, note: rec.note }] : [];
    });
    const categoryChanges = (r.categoryChanges ?? []).flatMap((change) => {
      const entry = entryById.get(change.entryId);
      const toCategoryName = categoryNameById.get(change.toCategoryId);
      if (!entry || !toCategoryName) return [];
      return [
        {
          entry,
          fromCategoryName: change.fromCategoryId
            ? (categoryNameById.get(change.fromCategoryId) ?? null)
            : null,
          toCategoryName,
          source: change.source,
        },
      ];
    });

    if (newTxs.length > 0 || updatedTxs.length > 0 || categoryChanges.length > 0) {
      resolved.set(r.accountRegisterId, {
        newTxs,
        updatedTxs,
        categoryChanges,
      });
    }
  }
  return resolved.size > 0 ? resolved : null;
}

function detailCell(
  content: string,
  opts: { align?: "right"; color?: string; noWrap?: boolean } = {},
): string {
  const style = [
    "padding:6px 12px 6px 0;border-bottom:1px solid #eee;font-size:13px;",
    opts.align === "right" ? "text-align:right;" : "",
    opts.color ? `color:${opts.color};` : "",
    opts.noWrap ? "white-space:nowrap;" : "",
  ]
    .filter(Boolean)
    .join("");
  return `<td style="${style}">${content}</td>`;
}

function detailTableHtml(headers: string[], rowsHtml: string): string {
  const headHtml = headers
    .map(
      (h) =>
        `<th style="text-align:${h === "Amount" ? "right" : "left"};padding:4px 12px 4px 0;border-bottom:1px solid #ccc;font-size:12px;color:#666;">${h}</th>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;max-width:560px;margin:0 0 4px;">${rowsHtml ? `<thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody>` : ""}</table>`;
}

function txRowCells(entry: DetailEntry, extraCells: string): string {
  const description = escapeHtml(entry.description || "Transaction");
  return [
    detailCell(formatEntryDate(entry.createdAt), { noWrap: true, color: "#666" }),
    detailCell(
      entry.isPending ? `${description} <span style="color:#999;">(pending)</span>` : description,
    ),
    detailCell(formatSignedUsd(decimalToNumber(entry.amount)), {
      align: "right",
      noWrap: true,
    }),
    extraCells,
  ].join("");
}

/** escapeHtml plus ASCII-safe arrows for email-client charset robustness. */
function escapeEmailText(s: string): string {
  return escapeHtml(s).replaceAll("→", "&rarr;");
}

function buildDetailSectionsHtml(
  registers: RegisterSyncStatsRow[],
  details: Map<number, ResolvedRegisterDetails>,
): string {
  const sections: string[] = [];

  for (const r of registers) {
    const d = details.get(r.accountRegisterId);
    if (!d) continue;

    const parts: string[] = [];
    if (d.newTxs.length > 0) {
      const rows = d.newTxs.slice(0, MAX_DETAIL_ROWS);
      const rowsHtml = rows
        .map(
          (entry) =>
            `<tr>${txRowCells(
              entry,
              detailCell(
                entry.categoryName ? escapeHtml(entry.categoryName) : `<span style="color:#999;">Uncategorized</span>`,
                { color: "#666" },
              ),
            )}</tr>`,
        )
        .join("");
      parts.push(
        `<div style="font-size:12px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px;">New transactions</div>${detailTableHtml(["Date", "Description", "Amount", "Category"], withMoreRow(rowsHtml, d.newTxs.length, 4))}`,
      );
    }

    if (d.updatedTxs.length > 0) {
      const rows = d.updatedTxs.slice(0, MAX_DETAIL_ROWS);
      const rowsHtml = rows
        .map(({ entry, note }) =>
          `<tr>${txRowCells(entry, detailCell(escapeEmailText(note ?? "Updated from bank"), { color: "#666" }))}</tr>`,
        )
        .join("");
      parts.push(
        `<div style="font-size:12px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px;">Updated transactions</div>${detailTableHtml(["Date", "Description", "Amount", "What changed"], withMoreRow(rowsHtml, d.updatedTxs.length, 4))}`,
      );
    }

    if (d.categoryChanges.length > 0) {
      const rows = d.categoryChanges.slice(0, MAX_DETAIL_ROWS);
      const itemsHtml = rows
        .map(({ entry, fromCategoryName, toCategoryName, source }) => {
          const sourceSuffix = categorySourceLabel(source);
          const change = fromCategoryName
            ? `${escapeHtml(fromCategoryName)} &rarr; ${escapeHtml(toCategoryName)}`
            : escapeHtml(toCategoryName);
          return `<li style="margin:2px 0;">${formatEntryDate(entry.createdAt)} &middot; ${escapeHtml(entry.description || "Transaction")} &middot; ${formatSignedUsd(decimalToNumber(entry.amount))} &mdash; ${change}${sourceSuffix ? ` <span style="color:#999;">(${sourceSuffix})</span>` : ""}</li>`;
        })
        .join("");
      const moreCount = d.categoryChanges.length - rows.length;
      parts.push(
        `<div style="font-size:12px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px;">Categories updated automatically</div><ul style="margin:0 0 4px;padding-left:18px;font-size:13px;color:#333;">${itemsHtml}</ul>${moreCount > 0 ? `<div style="font-size:12px;color:#999;margin:2px 0 4px;">+ ${moreCount} more &mdash; open the register to see all</div>` : ""}`,
      );
    }

    if (parts.length === 0) continue;

    sections.push(
      `<div style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eee;"><div style="font-size:15px;font-weight:bold;margin:0 0 4px;">${escapeHtml(r.name || "Account")}</div>${parts.join("")}</div>`,
    );
  }

  return sections.join("");
}

function withMoreRow(rowsHtml: string, total: number, colspan: number): string {
  const moreCount = total - MAX_DETAIL_ROWS;
  if (moreCount <= 0) return rowsHtml;
  return `${rowsHtml}<tr><td colspan="${colspan}" style="padding:6px 0;font-size:12px;color:#999;">+ ${moreCount} more &mdash; open the register to see all</td></tr>`;
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

  const syncAccountsUrl = buildAppUrl("/edit-profile/sync-accounts");
  const greeting = user.firstName?.trim() ? `${user.firstName},` : "Hi,";
  const codeLine = escapeHtml(webhookCode);

  const html = `${greeting}<br><br>
Your bank connection in Dineros needs attention. Plaid reported: <strong>${codeLine}</strong>.<br><br>
Please reconnect your bank in Dineros so we can keep importing transactions.<br><br>
${syncAccountsUrl ? `<p><a href="${syncAccountsUrl}">Open Sync accounts</a></p>` : "<p>Open Dineros and reconnect your bank from Sync accounts.</p>"}
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
