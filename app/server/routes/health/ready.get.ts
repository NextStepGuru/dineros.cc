import { createError } from "h3";
import { prisma } from "~/server/clients/prismaClient";

const READINESS_DB_TIMEOUT_MS = 2_000;

async function queryDatabaseWithTimeout(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  await Promise.race([
    prisma.$queryRaw`SELECT 1`,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Database readiness check timed out"));
      }, READINESS_DB_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export default defineEventHandler(async () => {
  try {
    await queryDatabaseWithTimeout();
    return { ok: true };
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: "Not Ready",
      message: "Database pool is unhealthy or timed out",
    });
  }
});
