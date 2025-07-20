import { isPrismaActive } from "~/server/clients/prismaClient";
import { checkRedisConnection } from "~/server/clients/redisClient";

export default defineEventHandler(async () => {
  return {
    status: "Readiness check passed",
    database: (await isPrismaActive()) ? true : false,
    redis: (await checkRedisConnection()) ? true : false,
    // nats: (await isNatsConnectionActive()) ? true : false,
  };
});
