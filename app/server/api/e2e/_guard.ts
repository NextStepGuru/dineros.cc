import { timingSafeEqual } from "node:crypto";
import { createError, getHeader, getRequestURL, type H3Event } from "h3";
import env from "~/server/env";

function isLoopbackRequest(event: H3Event): boolean {
  try {
    const host = getRequestURL(event).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * E2E seed/cleanup is only available in staging and requires `x-e2e-token`
 * matching `process.env.E2E_SEED_TOKEN`.
 */
export function assertE2EAllowed(event: H3Event): void {
  const deploy = env?.DEPLOY_ENV ?? process.env.DEPLOY_ENV;
  /** `pnpm dev` often has NODE_ENV=development while DEPLOY_ENV defaults to production in envSchema. */
  const isDevLike =
    deploy === "local" ||
    (deploy === "production" && process.env.NODE_ENV === "development") ||
    (deploy === undefined && process.env.NODE_ENV === "development");
  const allowLocalE2E = process.env.E2E === "1" && isDevLike;
  /**
   * Playwright + `pnpm dev` often reuse an existing server without `E2E=1`, and Nitro may set
   * NODE_ENV=production. Loopback + configured token matches local E2E without weakening staging.
   */
  const allowLocalLoopback =
    isLoopbackRequest(event) && !!process.env.E2E_SEED_TOKEN?.trim();
  if (deploy !== "staging" && !allowLocalE2E && !allowLocalLoopback) {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }
  const expected = process.env.E2E_SEED_TOKEN?.trim();
  if (!expected) {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }
  const token = getHeader(event, "x-e2e-token")?.trim();
  const tokenOk =
    token != null &&
    token.length === expected.length &&
    timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"));
  if (!tokenOk) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
}
