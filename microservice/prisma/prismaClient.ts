import prismaPkg from "@prisma/client";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import { log } from "../../logger";

const { PrismaClient } = prismaPkg;

export const getDbDecryptionKeyValues = (): string[] => {
  return Object.keys(process.env)
    .filter(
      (key) =>
        key.startsWith("DB_DECRYPTION_KEY") && key !== "DB_DECRYPTION_KEYS"
    )
    .map((key) => process.env[key]!)
    .filter((value) => value !== undefined); // Ensure no undefined values
};

const dbDecryptionKeyValues = getDbDecryptionKeyValues();

export const globalClient = new PrismaClient({
  log: ["error"],
});

export const prisma = globalClient.$extends(
  fieldEncryptionExtension({
    encryptionKey: process.env.DB_ENCRYPTION_KEY,
    decryptionKeys: dbDecryptionKeyValues,
  })
) as PrismaClientType;

const connectWithRetry = async (
  maxAttempts = 10,
  baseMs = 1000
): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      return true;
    } catch (error) {
      log({
        message: attempt === 1 ? "Prisma connect (retrying…)" : "Prisma connect retry",
        data: { attempt, maxAttempts, error },
        level: attempt === maxAttempts ? "error" : "warn",
      });
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, attempt - 1)));
      }
    }
  }
  return false;
};

export const initializePrisma = async () => {
  const ok = await connectWithRetry();
  if (ok) log({ message: "Prisma client connected to the database.", level: "debug" });
};

export const closePrisma = async () => {
  try {
    await prisma.$disconnect();
    log({ message: "Prisma client disconnected successfully.", level: "debug" });
  } catch (error) {
    log({ message: "Error disconnecting Prisma client:", data: error, level: "error" });
  }

  return true;
};

export const isPrismaActive = async () => {
  return connectWithRetry(5, 2000);
};
