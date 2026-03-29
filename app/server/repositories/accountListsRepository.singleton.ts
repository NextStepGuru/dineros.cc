import { prisma } from "~/server/clients/prismaClient";
import { createPrismaAccountListsRepository } from "./accountListsRepository";

export const accountListsRepository =
  createPrismaAccountListsRepository(prisma);
