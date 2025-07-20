import type { PrismaClient } from "@prisma/client";
import { prisma } from "~/prisma/prismaClient";
import { migrate } from "~/prisma/reencrypt";
import RsaService from "~/server/services/RsaService";

export default defineEventHandler(async () => {
  const rsaSvc = new RsaService();

  await rsaSvc.generateKeys();
  await migrate(prisma as PrismaClient);

  return true;
});
