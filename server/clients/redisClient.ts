import type { RedisOptions } from "ioredis";
import Redis from "ioredis";
import env from "../env";
import { log } from "../logger";

// Configure Redis connection options
const redisOptions: RedisOptions = {
  port: env.REDIS_PORT,
  host: env.REDIS_HOST,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000); // Exponential backoff up to 2 seconds
    log({
      message: `Redis connection lost. Retrying in ${delay} ms...`,
      level: "warn",
    });
    return delay;
  },
};

// In test mode, create a mock Redis connection
const isTestMode = process.env.NODE_ENV === "test";

export const sharedRedisConnection = isTestMode
  ? ({
      // Mock Redis connection for tests
      on: () => {},
      ping: async () => "PONG",
      disconnect: () => {},
    } as any)
  : new Redis(redisOptions);

if (!isTestMode) {
  sharedRedisConnection.on("ready", () => {
    log({ message: "Redis connection ready.", level: "debug" });
  });
  sharedRedisConnection.on("error", (error: any) => {
    log({ message: "Redis error:", data: error, level: "error" });
  });
}

export const checkRedisConnection = async () => {
  try {
    const response = await sharedRedisConnection.ping();
    return response === "PONG";
  } catch (error) {
    log({ message: "Redis ping failed:", data: error, level: "error" });
    return false;
  }
};

export const closeRedis = () => {
  log({ message: "Closing Redis connection..." });
  sharedRedisConnection.disconnect();

  return true;
};
