import prismaPkg from "@prisma/client";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import { normalizePrismaDmmfForFieldEncryption } from "~/lib/normalizePrismaDmmf";
import env from "../env";
import { log } from "../logger";

if (!env) {
  throw new Error("Server env validation failed; cannot initialize Prisma.");
}

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
  }),
) as PrismaClientType;

const connectWithRetry = async (
  maxAttempts = 10,
  baseMs = 1000,
): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      return true;
    } catch (error) {
      log({
        message:
          attempt === 1 ? "Prisma connect (retrying…)" : "Prisma connect retry",
        data: { attempt, maxAttempts, error },
        level: attempt === maxAttempts ? "error" : "warn",
      });
      if (attempt < maxAttempts) {
        await new Promise((r) =>
          setTimeout(r, baseMs * Math.pow(2, attempt - 1)),
        );
      }
    }
  }
  return false;
};

export const initializePrisma = async () => {
  const ok = await connectWithRetry();
  if (ok) log({ message: "Prisma client connected to the database." });
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
  return connectWithRetry(5, 2000);
};
