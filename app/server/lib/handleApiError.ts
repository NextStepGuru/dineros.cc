import { z } from "zod";
import { createError } from "h3";
import { log } from "~/server/logger";
import { poolTimeoutHealthService } from "~/server/services/poolTimeoutHealthService";

function throwIfPrismaStructureError(error: unknown): void {
  if (!error || typeof error !== "object") return;
  const o = error as Record<string, unknown>;

  if ("name" in o && o.name === "PrismaClientInitializationError") {
    log({
      message: "Database connection error",
      data: {
        name: o.name,
        message: o.message,
        stack: o.stack,
      },
      level: "error",
    });
    throw createError({
      statusCode: 503,
      statusMessage: "Service temporarily unavailable. Please try again later.",
    });
  }

  if (
    "name" in o &&
    typeof o.name === "string" &&
    o.name.startsWith("Prisma")
  ) {
    log({
      message: "Database operation error",
      data: {
        name: o.name,
        message: o.message,
        code: o.code,
      },
      level: "error",
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Database operation failed",
    });
  }

  if (
    "code" in o &&
    typeof o.code === "string" &&
    o.code.startsWith("P")
  ) {
    log({
      message: "Database operation error",
      data: {
        code: o.code,
        message: o.message,
      },
      level: "error",
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Database operation failed",
    });
  }
}

export const handleApiError = (error: unknown) => {
  poolTimeoutHealthService.record(error);

  if (error instanceof z.ZodError) {
    log({ message: "Invalid Request Data", data: error, level: "warn" });
    throw createError({
      statusCode: 400,
      statusMessage: error.issues
        .map((err) => `${err.path}: ${err.message}`)
        .join(", "),
    });
  }

  throwIfPrismaStructureError(error);

  // Handle other errors
  if (error instanceof Error) {
    log({ message: "API error", data: error, level: "error" });
    const isProd = process.env.NODE_ENV === "production";
    throw createError({
      statusCode: 500,
      statusMessage: isProd
        ? "Something went wrong"
        : error.message || "Something went wrong",
    });
  }

  // Handle unknown errors - return without throwing for null/undefined/unknown types
  if (error === null || error === undefined) {
    return;
  }

  // For other unknown error types, don't throw (as expected by tests)
  log({ message: "Unknown error", data: error, level: "error" });
};
