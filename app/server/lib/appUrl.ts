import env from "~/server/env";
import { log } from "~/server/logger";

const LOCAL_DEFAULT_APP_URL = "http://localhost:3000";

let warnedMissingSiteUrl = false;
let warnedInvalidSiteUrl = false;

function normalizeSiteUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getConfiguredAppBaseUrl(): string | null {
  const raw = env?.NUXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    const normalized = normalizeSiteUrl(raw);
    if (normalized) {
      return normalized;
    }
    if (!warnedInvalidSiteUrl) {
      warnedInvalidSiteUrl = true;
      log({
        message:
          "Invalid NUXT_PUBLIC_SITE_URL; expected absolute http(s) URL. Falling back based on environment.",
        level: "warn",
        data: { deployEnv: env?.DEPLOY_ENV, value: raw },
      });
    }
  }

  if (env?.DEPLOY_ENV === "local") {
    return LOCAL_DEFAULT_APP_URL;
  }

  if (!warnedMissingSiteUrl) {
    warnedMissingSiteUrl = true;
    log({
      message:
        "NUXT_PUBLIC_SITE_URL is missing in non-local environment; URL-based features may be unavailable.",
      level: "warn",
      data: { deployEnv: env?.DEPLOY_ENV },
    });
  }

  return null;
}

export function buildAppUrl(path: string): string | null {
  const baseUrl = getConfiguredAppBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
