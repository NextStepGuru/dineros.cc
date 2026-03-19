import prismaPkg from "@prisma/client";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import { normalizePrismaDmmfForFieldEncryption } from "../lib/normalizePrismaDmmf";
import { log } from "~/server/logger";

const { PrismaClient, Prisma } = prismaPkg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Prisma initialization.");
}

const adapter = new PrismaMariaDb(databaseUrl);

export const getDbDecryptionKeyValues = (): string[] => {
  return Object.keys(process.env)
    .filter(
      (key) =>
        key.startsWith("DB_DECRYPTION_KEY") && key !== "DB_DECRYPTION_KEYS",
    )
    .map((key) => process.env[key]!)
    .filter((value) => value !== undefined); // Ensure no undefined values
};

const dbDecryptionKeyValues = getDbDecryptionKeyValues();
if (
  process.env.DB_ENCRYPTION_KEY &&
  !dbDecryptionKeyValues.includes(process.env.DB_ENCRYPTION_KEY)
) {
  dbDecryptionKeyValues.push(process.env.DB_ENCRYPTION_KEY);
}

export const globalClient = new PrismaClient({
  log: ["error"],
  adapter,
});

export const prisma = globalClient.$extends(
  fieldEncryptionExtension({
    dmmf: normalizePrismaDmmfForFieldEncryption(Prisma.dmmf),
    encryptionKey: process.env.DB_ENCRYPTION_KEY,
    decryptionKeys: dbDecryptionKeyValues,
  }),
) as PrismaClientType;

export const initializePrisma = async () => {
  try {
    await prisma.$connect();
    log({
      message: "Prisma client connected to the database.",
      level: "debug",
    });
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
    log({
      message: "Prisma client disconnected successfully.",
      level: "debug",
    });
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
    log({
      message: "isPrismaActive Error",
      data: error,
      level: "error",
    });
    return false;
  }
};
