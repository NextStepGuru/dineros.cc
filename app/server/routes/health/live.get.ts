import { createError } from "h3";
import { poolTimeoutHealthService } from "~/server/services/poolTimeoutHealthService";

export default defineEventHandler(() => {
  const state = poolTimeoutHealthService.getState();

  if (!poolTimeoutHealthService.isLive()) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unhealthy",
      message:
        "Too many database pool timeouts observed recently; restart required",
      data: state,
    });
  }

  return {
    ok: true,
    ...state,
  };
});
