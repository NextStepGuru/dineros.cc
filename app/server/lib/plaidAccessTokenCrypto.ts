import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import env from "~/server/env";

function getAesKey(): Buffer {
  return createHash("sha256").update(env.DB_ENCRYPTION_KEY).digest();
}

/** Persisted form: base64url(iv 12 + tag 16 + ciphertext) — never matches Plaid `access-…` prefix. */
export function encryptPlaidAccessTokenForSettings(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getAesKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptPlaidAccessTokenFromSettings(stored: string): string {
  const buf = Buffer.from(stored, "base64url");
  if (buf.length < 28) {
    throw new Error("Invalid encrypted Plaid token payload");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getAesKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * Returns a usable Plaid access token from `user.settings.plaid.access_token`.
 * Supports legacy plaintext (`access-…`) and AES-GCM blobs written by encryptPlaidAccessTokenForSettings.
 */
export function resolvePlaidAccessTokenFromStored(
  stored: string | undefined | null,
): string | null {
  if (!stored || typeof stored !== "string") return null;
  const t = stored.trim();
  if (!t) return null;
  if (t.startsWith("access-")) {
    return t;
  }
  try {
    return decryptPlaidAccessTokenFromSettings(t);
  } catch {
    return t;
  }
}
