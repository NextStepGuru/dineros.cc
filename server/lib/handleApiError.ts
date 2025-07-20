import { z } from "zod";
import { createError } from "h3";
import { log } from "~/server/logger";

export const handleApiError = (error: unknown) => {
  if (error instanceof z.ZodError) {
    log({ message: "Invalid Request Data", data: error, level: "warn" });
    throw createError({
      statusCode: 400,
      statusMessage: error.errors
        .map((err) => `${err.path}: ${err.message}`)
        .join(", "),
    });
  }

  // Handle Prisma initialization errors (database connection issues)
  if (error && typeof error === "object" && "name" in error) {
    const errorObj = error as any;

    if (errorObj.name === "PrismaClientInitializationError") {
      log({
        message: "Database connection error",
        data: {
          name: errorObj.name,
          message: errorObj.message,
          stack: errorObj.stack,
        },
        level: "error",
      });

      throw createError({
        statusCode: 503,
        statusMessage:
          "Service temporarily unavailable. Please try again later.",
      });
    }

    // Handle other Prisma errors
    if (errorObj.name && errorObj.name.startsWith("Prisma")) {
      log({
        message: "Database operation error",
        data: {
          name: errorObj.name,
          message: errorObj.message,
          code: errorObj.code,
        },
        level: "error",
      });

      throw createError({
        statusCode: 500,
        statusMessage: "Database operation failed",
      });
    }
  }

  // Handle Prisma errors by code (for objects without name property)
  if (error && typeof error === "object" && "code" in error) {
    const errorObj = error as any;
    if (
      errorObj.code &&
      typeof errorObj.code === "string" &&
      errorObj.code.startsWith("P")
    ) {
      log({
        message: "Database operation error",
        data: {
          code: errorObj.code,
          message: errorObj.message,
        },
        level: "error",
      });

      throw createError({
        statusCode: 500,
        statusMessage: "Database operation failed",
      });
    }
  }

  // Handle other errors
  if (error instanceof Error) {
    log({ message: "API error", data: error, level: "error" });
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Something went wrong",
    });
  }

  // Handle unknown errors - return without throwing for null/undefined/unknown types
  if (error === null || error === undefined) {
    return;
  }

  // For other unknown error types, don't throw (as expected by tests)
  log({ message: "Unknown error", data: error, level: "error" });
  return;
};
