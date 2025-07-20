import { defineEventHandler } from "h3";
import { log } from "~/server/logger";
import { handleApiError } from "~/server/lib/handleApiError";

export function withErrorHandler(handler: Function) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event);
    } catch (error) {
      // Log the error for debugging
      log({
        message: "API error caught by global handler",
        data: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          url: event.node.req.url,
          method: event.node.req.method,
        },
        level: "error",
      });

      // Use our existing error handler
      handleApiError(error);
    }
  });
}
