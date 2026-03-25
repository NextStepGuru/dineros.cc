import type { JetStreamClient, NatsConnection } from "nats";
import { connect } from "nats";
import { log } from "../logger";
import env from "../env";

let natsConnection: NatsConnection | null = null;
let jetStreamClient: JetStreamClient | null = null;

const MAX_RETRIES = 5; // Maximum number of retry attempts
const RETRY_BACKOFF = 2000; // Backoff time (ms) between retries

/**
 * Initializes and returns a reusable NATS connection with retry logic and monitoring.
 */
export async function getNatsConnection() {
  if (natsConnection && !natsConnection.isClosed()) {
    return natsConnection; // Return existing active connection
  }

  const natsUrl = env?.NATS_URL;
  if (natsUrl === undefined) {
    log({
      level: "error",
      message: "NATS_URL is unavailable (environment was not validated).",
    });
    return null;
  }

  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      natsConnection = await connect({ servers: natsUrl });
      log({ message: "Connected to NATS" });

      // Start monitoring connection status
      monitorNatsConnection(natsConnection);

      return natsConnection;
    } catch (error) {
      attempts++;
      log({
        level: "error",
        message: `Failed to connect to NATS. Attempt ${attempts} of ${MAX_RETRIES}.`,
        data: error,
      });
      if (attempts < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF)); // Backoff before retrying
      } else {
        log({
          message:
            "Exceeded maximum retry attempts. Could not connect to NATS.",
          level: "error",
        });
        return null;
      }
    }
  }
  return null; // Return null if all retries fail
}

/**
 * Initializes and returns a reusable JetStream client.
 */
export async function getJetStreamClient() {
  if (!jetStreamClient) {
    const nc = await getNatsConnection();
    if (nc) {
      jetStreamClient = nc.jetstream();
    } else {
      log({
        message:
          "Failed to create JetStream client as NATS connection is unavailable.",
        level: "error",
      });
    }
  }
  return jetStreamClient;
}

/**
 * Monitors the status of the NATS connection.
 */
async function monitorNatsConnection(nc: NatsConnection): Promise<void> {
  for await (const status of nc.status()) {
    switch (status.type) {
      case "disconnect":
        log({ level: "warn", message: "Disconnected from NATS server." });
        break;
      case "reconnect":
        log({ level: "warn", message: "Reconnected to NATS server." });
        break;
      case "error":
        log({
          message: "Error in NATS connection:",
          data: status.data,
          level: "error",
        });
        break;
      case "ldm":
        log({
          message: "NATS connection is entering Lame Duck Mode",
          level: "warn",
        });
        break;
      case "pingTimer":
        log({ level: "debug", message: "NATS ping/pong" });
        break;
      default:
        log({ message: `NATS unknown status: ${status.type}`, level: "debug" });
    }
  }
}

/**
 * Closes the NATS connection gracefully.
 */
export async function closeNatsConnection() {
  if (natsConnection) {
    await natsConnection.close();
    log({ level: "warn", message: "NATS connection closed" });
    natsConnection = null;
    jetStreamClient = null;
  }
}

/**
 * Checks if the NATS connection is active.
 */
export async function isNatsConnectionActive() {
  if (!natsConnection || natsConnection.isClosed()) {
    log({ message: "NATS connection is not active", level: "error" });
    throw new Error("NATS Connection is not active");
  }

  return true;
}

/**
 * Graceful shutdown handler to close the NATS connection on application exit.
 */
process.on("SIGINT", async () => {
  await closeNatsConnection();
  process.exit();
});

process.on("SIGTERM", async () => {
  await closeNatsConnection();
  process.exit();
});
