import { PrismaClient } from "@prisma/client";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import { log } from "../../logger";

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
);

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
    log({ message: "Prisma client disconnected successfully.", level: "debug" });
  } catch (error) {
    log({ message: "Error disconnecting Prisma client:", data: error, level: "error" });
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
