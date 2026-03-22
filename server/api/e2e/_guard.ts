import { createError, getHeader, type H3Event } from "h3";
import env from "~/server/env";

/**
 * E2E seed/cleanup is only available in staging and requires `x-e2e-token`
 * matching `process.env.E2E_SEED_TOKEN`.
 */
export function assertE2EAllowed(event: H3Event): void {
  const deploy = env?.DEPLOY_ENV;
  const allowLocalE2E = deploy === "local" && process.env.E2E === "1";
  if (deploy !== "staging" && !allowLocalE2E) {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }
  const expected = process.env.E2E_SEED_TOKEN?.trim();
  if (!expected) {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }
  const token = getHeader(event, "x-e2e-token")?.trim();
  if (!token || token !== expected) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
}
