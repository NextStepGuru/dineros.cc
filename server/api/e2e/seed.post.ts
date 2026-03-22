import { createError, defineEventHandler, setResponseStatus } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";
import { log } from "~/server/logger";
import { seedE2EUser } from "~/server/services/e2eSeedService";
import { assertE2EAllowed } from "./_guard";

function prismaRequestErrorInfo(error: unknown): {
  code: string;
  message: string;
} | null {
  let cur: unknown = error;
  for (let i = 0; i < 6; i++) {
    if (!cur || typeof cur !== "object") return null;
    const e = cur as {
      code?: unknown;
      message?: unknown;
      name?: unknown;
      cause?: unknown;
    };
    if (typeof e.code === "string" && e.code.startsWith("P")) {
      return { code: e.code, message: String(e.message ?? "") };
    }
    if (e.name === "PrismaClientValidationError") {
      return { code: "ValidationError", message: String(e.message ?? "") };
    }
    if (e.cause) {
      cur = e.cause;
      continue;
    }
    return null;
  }
  return null;
}

export default defineEventHandler(async (event) => {
  try {
    assertE2EAllowed(event);
    const result = await seedE2EUser();
    setResponseStatus(event, 201);
    return result;
  } catch (error) {
    const prismaInfo = prismaRequestErrorInfo(error);
    log({
      message: "E2E seed failed",
      data: prismaInfo ?? {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      },
      level: "error",
    });
    if (prismaInfo) {
      throw createError({
        statusCode: 500,
        statusMessage: `${prismaInfo.code}: ${prismaInfo.message}`,
      });
    }
    handleApiError(error);
    throw error;
  }
});
