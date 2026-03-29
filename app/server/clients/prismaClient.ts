import { createHash } from "node:crypto";
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

const encryptionKey = env.DB_ENCRYPTION_KEY;
const decryptionKeys = env.DB_DECRYPTION_KEYS;

/**
 * Builds the base Prisma client and the field-encryption–extended client.
 * Lazy: only runs when the app first accesses `prisma` / `globalClient` / `getPrisma()`.
 */
export function createAppPrisma(): {
  baseClient: InstanceType<typeof PrismaClient>;
  prisma: PrismaClientType;
} {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Prisma initialization.");
  }

  const adapter = new PrismaMariaDb(databaseUrl);

  const baseClient = new PrismaClient({
    log: ["warn"],
    adapter,
  });

  const debugKeys =
    process.env.LOGIN_DEBUG === "1" || process.env.DEBUG_KEYS === "1";
  if (debugKeys) {
    const fp = (s: string) =>
      createHash("sha256").update(s).digest("hex").slice(0, 8);
    const encFp = fp(encryptionKey);
    const decFps = Array.isArray(decryptionKeys)
      ? decryptionKeys.map((k: string) => fp(k))
      : [];
    log({
      message:
        "[KEYS][prismaClient] Extension config (what Prisma field encryption receives)",
      level: "info",
      data: {
        encryptionKeyLen: encryptionKey.length,
        encryptionKeyFingerprint: encFp,
        decryptionKeysCount: Array.isArray(decryptionKeys)
          ? decryptionKeys.length
          : 0,
        decryptionKeyFingerprints: decFps,
        encryptionKeyInDecryptionList: decFps.includes(encFp),
        decryptionKeyLengths: Array.isArray(decryptionKeys)
          ? decryptionKeys.map((k: string) => k.length)
          : [],
      },
    });
  }

  const prisma = baseClient.$extends(
    fieldEncryptionExtension({
      dmmf: normalizePrismaDmmfForFieldEncryption(Prisma.dmmf),
      encryptionKey,
      decryptionKeys,
    }),
  ) as PrismaClientType;

  return { baseClient, prisma };
}

let cachedBase: InstanceType<typeof PrismaClient> | null = null;
let cachedExtended: PrismaClientType | null = null;

function ensureClients(): void {
  if (cachedExtended) return;
  const { baseClient, prisma } = createAppPrisma();
  cachedBase = baseClient;
  cachedExtended = prisma;
}

/** Returns the extended Prisma client (field encryption). Constructs on first call. */
export function getPrisma(): PrismaClientType {
  ensureClients();
  return cachedExtended!;
}

function getBaseClient(): InstanceType<typeof PrismaClient> {
  ensureClients();
  return cachedBase!;
}

/**
 * Underlying Prisma client before field-encryption extension (lazy).
 * Prefer `prisma` / `getPrisma()` for application code.
 */
export const globalClient = new Proxy({} as InstanceType<typeof PrismaClient>, {
  get(_target, prop, receiver) {
    return Reflect.get(getBaseClient(), prop, receiver);
  },
});

/** Extended Prisma client (field encryption). Lazy — no DB adapter until first access. */
export const prisma = new Proxy({} as PrismaClientType, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  },
});

const connectWithRetry = async (
  maxAttempts = 10,
  baseMs = 1000,
): Promise<boolean> => {
  const client = getPrisma();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.$connect();
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
    await getPrisma().$disconnect();
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
