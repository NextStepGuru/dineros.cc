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

  // Handle Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    log({ message: "Database error", data: error, level: "error" });
    throw createError({
      statusCode: 500,
      statusMessage: "Database operation failed",
    });
  }

  // Handle other errors
  if (error instanceof Error) {
    log({ message: "API error", data: error, level: "error" });
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }
};
