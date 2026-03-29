import { defineEventHandler, setResponseStatus } from "h3";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../clients/prismaClient";
import { migrate } from "../prisma/reencrypt";
import { log } from "../logger";

export default defineEventHandler(async (event) => {
  setResponseStatus(event, 202);
  void migrate(prisma as PrismaClient).catch((error: unknown) => {
    log({
      level: "error",
      message: "Background reencrypt migration failed",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  });
  return { accepted: true, mode: "reencrypt" as const };
});
