import { isPrismaActive } from "~/server/clients/prismaClient";
import { checkRedisConnection } from "~/server/clients/redisClient";

export default defineEventHandler(async () => {
  const database = await isPrismaActive();
  const redis = await checkRedisConnection();

  return {
    status: "Liveness check passed",
    database,
    redis,
    // nats: (await isNatsConnectionActive()) ? true : false,
  };
});
