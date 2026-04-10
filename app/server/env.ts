import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import envSchema from "./envSchema";

const appRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const repoRoot = path.resolve(appRoot, "..");
// Monorepo: root `.env` then `app/.env` (override) so `pnpm dev` from repo root still picks up shared vars.
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(appRoot, ".env"), override: true });

export const getDbDecryptionKeyValues = (): string[] => {
  return Object.keys(process.env)
    .filter(
      (key) =>
        key.startsWith("DB_DECRYPTION_KEY") && key !== "DB_DECRYPTION_KEYS",
    )
    .map((key) => process.env[key])
    .filter((value): value is string => value !== undefined);
};

const dbDecryptionKeyValues = getDbDecryptionKeyValues();

if (process.env?.DB_ENCRYPTION_KEY) {
  dbDecryptionKeyValues.push(process.env.DB_ENCRYPTION_KEY);
}

const rawDecryptionKeysString = dbDecryptionKeyValues.join(",");
process.env.DB_DECRYPTION_KEYS = rawDecryptionKeysString;

const parsedEnv = envSchema.safeParse(process.env);

// Optional: LOGIN_DEBUG=1 or DEBUG_KEYS=1 to log key pipeline (no key values, only lengths/fingerprints).
const debugKeys =
  process.env.LOGIN_DEBUG === "1" || process.env.DEBUG_KEYS === "1";
if (debugKeys) {
  const encKey = process.env.DB_ENCRYPTION_KEY ?? "";
  const fp = (s: string) =>
    createHash("sha256").update(s).digest("hex").slice(0, 8);
  const base: Record<string, unknown> = {
    processEnvEncKeyLen: encKey.length,
    processEnvEncKeyFingerprint: fp(encKey),
    dbDecryptionKeyValuesCount: dbDecryptionKeyValues.length,
    dbDecryptionKeyLengths: dbDecryptionKeyValues.map((k) => k.length),
    dbDecryptionKeyFingerprints: dbDecryptionKeyValues.map(fp),
    rawDecryptionKeysStringLen: rawDecryptionKeysString.length,
    rawDecryptionKeysContainsComma: rawDecryptionKeysString.includes(","),
    parsedEnvSuccess: parsedEnv.success,
  };
  if (parsedEnv.success && parsedEnv.data) {
    base.parsedEncKeyLen = parsedEnv.data.DB_ENCRYPTION_KEY?.length ?? 0;
    base.parsedDecryptionKeysCount =
      parsedEnv.data.DB_DECRYPTION_KEYS?.length ?? 0;
    base.parsedDecryptionKeyLengths =
      parsedEnv.data.DB_DECRYPTION_KEYS?.map((k: string) => k.length);
  } else if (parsedEnv.error) {
    base.parseError = parsedEnv.error.message;
  }
  console.warn("[KEYS][env.ts] Before schema parse:", base);
}

export default parsedEnv.data;
