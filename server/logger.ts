import { LoggingWinston } from "@google-cloud/logging-winston";
import { Logging } from "@google-cloud/logging";
import winston, { format } from "winston";
import type { HttpRequest } from "@google-cloud/logging";

const isLocal = process.env.DEPLOY_ENV === "local";
const minLogLevel = isLocal ? "debug" : "info";

const transports = [];

const logging = new Logging();

const logName = `linearbudget-${process.env.DEPLOY_ENV}`;
const logGke = logging.log(logName);
const projectId = "nextstepguru";

if (!isLocal) {
  transports.push(
    new LoggingWinston({
      level: minLogLevel,
      labels: {
        name: "Dineros",
        version: "1.0.0",
      },
      // redirectToStdout: false,
      // useMessageField: false,
      // inspectMetadata: false,
      // handleExceptions: true,
      // handleRejections: true,
      logName: `projects/${projectId}/logs/${logName}`,
      projectId,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      defaultCallback: (err) => {
        if (err) {
          console.error(
            "Logging Error: Error occurred while sending logs",
            err
          );
        }
      },
    })
  );
}

transports.push(
  new winston.transports.Console({
    level: minLogLevel,
    format: format.combine(
      format.colorize(), // Colorize log levels
      format.timestamp({ format: "HH:mm:ss" }), // Timestamp format
      format.printf(({ timestamp, level, message, data }) => {
        let formattedMessage: string;

        if (!data) {
          return `[${level}] ${timestamp}: ${message}`;
        }

        // Try to parse and colorize JSON if the message is a JSON string
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let parsedMessage = data as any;

          if (data instanceof Error) {
            parsedMessage = {
              name: data.name,
              message: data.message,
              stack: data.stack,
            };
          } else if (typeof data === "object" && data !== null) {
            // Check all keys in the object for instances of Error
            parsedMessage = Object.keys(data).reduce((acc, key) => {
              const value: unknown = data[key as keyof typeof data];
              acc[key] = value instanceof Error ? serializeError(value) : value;
              return acc;
            }, {} as Record<string, unknown>);
          }

          formattedMessage = colorizeJson(parsedMessage);
        } catch {
          // If parsing fails, treat the message as a plain string
          formattedMessage = data as string;
        }

        return `[${level}] ${timestamp}: ${message} ${formattedMessage}`;
      })
    ),
  })
);

const serializeError = (error: unknown): string => {
  if (error instanceof Error) {
    // Extract the relevant properties from the Error object
    const serializedError = {
      name: error.name, // Error type (e.g., "TypeError")
      message: error.message, // Error message
      stack: error.stack, // Stack trace (optional)
      // Optionally include custom properties if the error is extended
      ...Object.keys(error).reduce((acc, key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc as any)[key] = (error as any)[key];
        return acc;
      }, {}),
    };
    return JSON.stringify(serializedError);
  }

  // Fallback for unknown error types
  return JSON.stringify({ message: "Unknown error", details: error });
};

const colorizeJson = (json: Record<string, unknown>) => {
  return JSON.stringify(
    json,
    (key, value) => {
      if (key === "stack" && typeof value === "string") {
        // Split the stack trace into an array of lines and add indentation
        return value
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n");
      }
      return value;
    },
    2
  )
    .replace(/"([^"]+)":/g, (match, p1) => `\x1b[36m${p1}: \x1b[0m`) // Keys in blue
    .replace(/: "([^"]+)"/g, (match, p1) => `\x1b[32m${p1}: \x1b[0m`) // String values in green
    .replace(/: (\d+)/g, (match, p1) => `\x1b[33m${p1}: \x1b[0m`); // Numbers in yellow
};

const logger = winston.createLogger({
  level: minLogLevel,
  exitOnError: false,
  transports,
});

export const logRequest = async ({
  httpRequest,
}: {
  httpRequest: HttpRequest;
}) => {
  const status = httpRequest.status || 0;

  // Determine log level based on status code
  let logLevel: "info" | "warn" | "error";
  if (status >= 500) {
    logLevel = "error";
  } else if (status >= 400) {
    logLevel = "warn";
  } else {
    logLevel = "info";
  }

  // Log with the determined level
  logger.log(
    logLevel,
    `${httpRequest.requestMethod}:${httpRequest.requestUrl}`,
    {
      httpRequest,
    }
  );

  if (!isLocal) {
    const entryGkeLog = logGke.entry(
      {
        resource: { type: "k8s_container" },
        // httpRequest,
      },
      {
        message: `${httpRequest.requestMethod}:${httpRequest.requestUrl}`,
      }
    );
    await logGke.write(entryGkeLog);
  }
};

export const log = ({
  message,
  level = "info",
  data = undefined,
}: {
  message: string;
  level?: "error" | "warn" | "info" | "debug";
  data?: unknown;
}) => {
  switch (level) {
    case "warn": {
      logger.warn({ message, data });
      break;
    }

    case "error": {
      logger.error({ message, data });
      break;
    }

    case "debug": {
      logger.debug({ message, data });
      break;
    }

    default: {
      logger.info({ message, data });
    }
  }
};
