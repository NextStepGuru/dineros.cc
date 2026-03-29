import {
  createError,
  defineEventHandler,
  isError,
  setResponseStatus,
} from "h3";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { recordAdminAudit } from "~/server/lib/recordAdminAudit";

function microserviceErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) {
    return fallback;
  }
  const o = body as { message?: unknown; statusMessage?: unknown };
  if (typeof o.message === "string") {
    return o.message;
  }
  if (typeof o.statusMessage === "string") {
    return o.statusMessage;
  }
  return fallback;
}

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);

    const config = useRuntimeConfig();
    const base =
      (typeof config.microserviceInternalUrl === "string"
        ? config.microserviceInternalUrl
        : ""
      ).trim() || process.env.MICROSERVICE_INTERNAL_URL?.trim() || "";
    const token = process.env.INTERNAL_API_TOKEN?.trim();

    if (!base || !token) {
      throw createError({
        statusCode: 503,
        statusMessage:
          "MICROSERVICE_INTERNAL_URL and INTERNAL_API_TOKEN must be configured for this action.",
      });
    }

    const url = `${base.replace(/\/$/, "")}/migrate`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-internal-token": token },
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const msg = microserviceErrorMessage(
        body,
        `Microservice returned ${res.status}`,
      );
      throw createError({
        statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
        statusMessage: msg,
      });
    }

    setResponseStatus(event, res.status);

    await recordAdminAudit(event, {
      action: "microservice.reencrypt_migrate",
      metadata: { microserviceStatus: res.status },
    });

    return body;
  } catch (error) {
    if (isError(error)) {
      throw error;
    }
    handleApiError(error);
    throw error;
  }
});
