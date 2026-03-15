import prismaPkg from "@prisma/client";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import env from "../env";
import { log } from "../logger";

const { PrismaClient } = prismaPkg;

export const globalClient = new PrismaClient({
  log: ["warn"],
}); // log: ["query", "error"]

export const prisma = globalClient.$extends(
  fieldEncryptionExtension({
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
