import prismaPkg from "@prisma/client";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import { normalizePrismaDmmfForFieldEncryption } from "../../lib/normalizePrismaDmmf";
import env from "../env";
import { log } from "../logger";

const { PrismaClient, Prisma } = prismaPkg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Prisma initialization.");
}

const adapter = new PrismaMariaDb(databaseUrl);

export const globalClient = new PrismaClient({
  log: ["warn"],
  adapter,
}); // log: ["query", "error"]

export const prisma = globalClient.$extends(
  fieldEncryptionExtension({
    dmmf: normalizePrismaDmmfForFieldEncryption(Prisma.dmmf),
    encryptionKey: env.DB_ENCRYPTION_KEY,
    decryptionKeys: env.DB_DECRYPTION_KEYS,
  })
) as PrismaClientType;

export const initializePrisma = async () => {
  try {
    await prisma.$connect();
    log({ message: "Prisma client connected to the database." });
  } catch (error) {
    log({
      message: "Error connecting Prisma client:",
      data: error,
      level: "error",
    });
  }
};

export const closePrisma = async () => {
  try {
    await prisma.$disconnect();
    log({ message: "Prisma client disconnected successfully." });
  } catch (error) {
    log({
      message: "Error disconnecting Prisma client:",
      data: error,
      level: "error",
    });
  }

  return true;
};

export const isPrismaActive = async () => {
  try {
    await prisma.$connect();
    return true;
  } catch (error) {
    log({ message: "isPrismaActive Error", data: error, level: "error" });
    return false;
  }
};
