import { defineEventHandler } from "h3";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../clients/prismaClient";
import { migrate } from "../prisma/reencrypt";

export default defineEventHandler(async () => {
  await migrate(prisma as PrismaClient);

  return { message: "Migration Complete" };
});
