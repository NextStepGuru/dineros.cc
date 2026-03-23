import { createHash, createPublicKey, timingSafeEqual } from "node:crypto";
import type { PlaidApi } from "plaid";
import jwt from "jsonwebtoken";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";

const MAX_AGE_SEC = 5 * 60; // 5 minutes

/** Decode JWT header without verifying (to get kid). */
function decodeHeader(token: string): { kid?: string; alg?: string } {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid JWT");
  const headerB64 = parts[0];
  if (!headerB64) throw new Error("Invalid JWT");
  const raw = Buffer.from(headerB64, "base64url").toString("utf8");
  return JSON.parse(raw) as { kid?: string; alg?: string };
}

/** JWK from Plaid may include created_at, expired_at; Node expects standard JWK. */
function toStandardJwk(key: Record<string, unknown>): Record<string, unknown> {
  const { kty, crv, x, y, alg, use, kid } = key;
  return {
    kty,
    crv,
    x,
    y,
    ...(alg != null && { alg }),
    ...(use != null && { use }),
    ...(kid != null && { kid }),
  };
}

export interface VerifyResult {
  valid: boolean;
  payload?: { iat: number; request_body_sha256: string };
}

/**
 * Verify Plaid webhook using Plaid-Verification JWT and request body.
 * Uses /webhook_verification_key/get for the key, then verifies signature, iat, and request_body_sha256.
 */
export async function verifyPlaidWebhook(
  plaidClient: PlaidApi,
  rawBody: string,
  verificationHeader: string | undefined,
): Promise<VerifyResult> {
  if (!verificationHeader?.trim()) {
    return { valid: false };
  }

  let header: { kid?: string; alg?: string };
  try {
    header = decodeHeader(verificationHeader);
  } catch {
    return { valid: false };
  }

  if (header.alg !== "ES256") {
    return { valid: false };
  }

  const kid = header.kid;
  if (!kid) {
    return { valid: false };
  }

  let keyResponse: { data: { key: Record<string, unknown> } };
  try {
    const res = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
    keyResponse = { data: { key: res.data.key as unknown as Record<string, unknown> } };
  } catch {
    return { valid: false };
  }

  const jwk = toStandardJwk(keyResponse.data.key);
  let publicKey: string;
  try {
    const keyObject = createPublicKey({ key: jwk, format: "jwk" });
    publicKey = keyObject.export({ type: "spki", format: "pem" }) as string;
  } catch {
    return { valid: false };
  }

  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(verificationHeader, publicKey, {
      algorithms: ["ES256"],
      clockTolerance: 0,
    });
  } catch {
    return { valid: false };
  }

  const payload =
    typeof decoded === "object" && decoded !== null ? decoded : {};
  const iat = payload.iat;
  if (typeof iat !== "number") {
    return { valid: false };
  }
  const now = Math.floor(dateTimeService.now().valueOf() / 1000);
  if (now - iat > MAX_AGE_SEC) {
    return { valid: false };
  }

  const claimedHash = payload.request_body_sha256;
  if (typeof claimedHash !== "string") {
    return { valid: false };
  }

  const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  if (claimedHash.length !== bodyHash.length) {
    return { valid: false };
  }
  try {
    const a = Buffer.from(claimedHash, "hex");
    const b = Buffer.from(bodyHash, "hex");
    if (!timingSafeEqual(a, b)) {
      return { valid: false };
    }
  } catch {
    return { valid: false };
  }

  return {
    valid: true,
    payload: { iat, request_body_sha256: claimedHash },
  };
}
