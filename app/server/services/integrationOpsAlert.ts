import type { Prisma } from "@prisma/client";
import env from "~/server/env";
import { prisma } from "~/server/clients/prismaClient";
import {
  hasPostmarkToken,
  postmarkClient,
} from "~/server/clients/postmarkClient";
import { sharedRedisConnection } from "~/server/clients/redisClient";
import { ADMIN_EMAIL } from "~/server/lib/adminConfig";
import { log } from "~/server/logger";
import { dateTimeService } from "~/server/services/forecast";

export type IntegrationAlertSource = "plaid" | "openai";
export type IntegrationAlertKind = "credential" | "other";

const CONSOLE_PREFIX = "[INTEGRATION_ALERT]";
const EMAIL_COOLDOWN_SEC = 24 * 60 * 60;

/** In-process fallback when Redis is unavailable (e.g. tests). */
const emailCooldownMemory = new Map<string, number>();

function integrationAlertRecipient(): string {
  const raw = env?.INTEGRATION_ALERT_EMAIL?.trim();
  if (raw) return raw;
  return ADMIN_EMAIL;
}

async function emailCooldownAllows(dedupeKey: string): Promise<boolean> {
  const key = `integration-alert-email:${dedupeKey}`;
  try {
    const res = await sharedRedisConnection.set(
      key,
      "1",
      "EX",
      EMAIL_COOLDOWN_SEC,
      "NX",
    );
    return res === "OK";
  } catch {
    const now = dateTimeService.nowDate().getTime();
    const last = emailCooldownMemory.get(key) ?? 0;
    if (now - last < EMAIL_COOLDOWN_SEC * 1000) return false;
    emailCooldownMemory.set(key, now);
    return true;
  }
}

export type NotifyIntegrationAlertParams = {
  source: IntegrationAlertSource;
  kind: IntegrationAlertKind;
  message: string;
  httpStatus?: number | null;
  details?: Prisma.InputJsonValue;
  /** Key for 24h email throttle; defaults to `${source}:${kind}`. */
  dedupeKey?: string;
  /** When false, skip email cooldown (still inserts DB row). Default true. */
  throttleEmail?: boolean;
};

/**
 * Persists an alert, logs + console.error, and optionally emails ops (with cooldown).
 */
export async function notifyIntegrationAlert(
  params: NotifyIntegrationAlertParams,
): Promise<void> {
  const {
    source,
    kind,
    message,
    httpStatus,
    details,
    dedupeKey: dedupeKeyParam,
    throttleEmail = true,
  } = params;

  const dedupeKey = dedupeKeyParam ?? `${source}:${kind}`;

  try {
    await prisma.integrationAlert.create({
      data: {
        source,
        kind,
        message,
        httpStatus: httpStatus ?? null,
        details: details ?? undefined,
        dedupeKey,
      },
    });
  } catch (dbErr) {
    log({
      message: "IntegrationAlert insert failed",
      data: { dbErr, source, kind },
      level: "error",
    });
  }

  const payload = {
    source,
    kind,
    message,
    httpStatus: httpStatus ?? null,
    dedupeKey,
  };

  log({
    message: "Integration alert",
    data: { ...payload, details },
    level: "error",
  });

  console.error(CONSOLE_PREFIX, JSON.stringify({ ...payload, details }));

  const isLocal = env?.DEPLOY_ENV === "local";
  const skipEmail =
    isLocal ||
    !hasPostmarkToken ||
    process.env.NODE_ENV === "test";

  if (skipEmail) {
    log({
      message: `${CONSOLE_PREFIX} email skipped (local, no Postmark, or test)`,
      data: { ...payload, to: integrationAlertRecipient() },
      level: "info",
    });
    return;
  }

  if (throttleEmail) {
    const allow = await emailCooldownAllows(dedupeKey);
    if (!allow) {
      log({
        message: `${CONSOLE_PREFIX} email skipped (cooldown)`,
        data: payload,
        level: "debug",
      });
      return;
    }
  }

  const to = integrationAlertRecipient();
  const subject = `[Dineros] ${source.toUpperCase()} ${kind} alert`;
  const httpLine =
    typeof httpStatus === "number"
      ? `<strong>HTTP:</strong> ${httpStatus}<br>`
      : "";
  const detailsBlock =
    details === null || details === undefined
      ? ""
      : `<pre style="white-space:pre-wrap;font-size:12px;">${escapeHtml(JSON.stringify(details, null, 2))}</pre>`;
  const html = `<p><strong>Source:</strong> ${escapeHtml(source)}<br>
<strong>Kind:</strong> ${escapeHtml(kind)}<br>
${httpLine}
</p>
<p>${escapeHtml(message)}</p>
${detailsBlock}
`;

  try {
    await postmarkClient.sendEmail({
      From: "Dineros Ops <pepe@dineros.cc>",
      To: to,
      Subject: subject,
      HtmlBody: html,
    });
  } catch (err) {
    log({
      message: "Integration alert email send failed",
      data: { err, to },
      level: "error",
    });
    console.error(CONSOLE_PREFIX, "email_send_failed", String(err));
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function isOpenAiCredentialFailure(
  httpStatus: number | null,
  errorMessage: string,
): boolean {
  if (httpStatus === 401) return true;
  const m = errorMessage.toLowerCase();
  if (m.includes("invalid_api_key")) return true;
  if (m.includes("incorrect api key")) return true;
  if (m.includes("invalid api key")) return true;
  return false;
}
