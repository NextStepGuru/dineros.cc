import { prisma } from "~/server/clients/prismaClient";
import { sharedRedisConnection } from "~/server/clients/redisClient";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);

    let databaseOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseOk = true;
    } catch {
      databaseOk = false;
    }

    let redisOk = false;
    try {
      const pong = await sharedRedisConnection.ping();
      redisOk = pong === "PONG";
    } catch {
      redisOk = false;
    }

    const config = useRuntimeConfig();

    return {
      app: {
        deployEnv:
          process.env.NUXT_PUBLIC_DEPLOY_ENV ||
          process.env.DEPLOY_ENV ||
          null,
        nodeEnv: process.env.NODE_ENV ?? null,
        buildId:
          process.env.BUILD_ID ??
          process.env.GIT_COMMIT ??
          process.env.VERCEL_GIT_COMMIT_SHA ??
          null,
      },
      checks: {
        database: databaseOk,
        redis: redisOk,
      },
      links: {
        bullBoardUrl: (config.public?.bullBoardUrl as string | undefined) || null,
        postmarkActivityBaseUrl:
          (config.public?.postmarkActivityBaseUrl as string | undefined) || null,
        externalLoggingUrl:
          (config.public?.externalLoggingUrl as string | undefined) || null,
        runbookUrl: (config.public?.runbookUrl as string | undefined) || null,
      },
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
