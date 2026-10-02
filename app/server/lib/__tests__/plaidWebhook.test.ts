import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createHash,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import jwt from "jsonwebtoken";
import { verifyPlaidWebhook } from "../plaidWebhook";

/**
 * Real-crypto tests: verifyPlaidWebhook uses createHash/createPublicKey/timingSafeEqual
 * (real in tests) plus jsonwebtoken ES256 verification, so we craft genuine ES256 JWTs
 * against a generated P-256 key served through a stubbed Plaid client.
 */
const RAW_BODY = JSON.stringify({
  webhook_type: "TRANSACTIONS",
  webhook_code: "SYNC_UPDATES_AVAILABLE",
  item_id: "item-123",
});

function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

describe("verifyPlaidWebhook", () => {
  let keyPair: { publicKey: KeyObject; privateKey: KeyObject };
  let privateKeyPem: string;
  let plaidJwk: Record<string, unknown>;
  let plaidClient: { webhookVerificationKeyGet: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    keyPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    privateKeyPem = keyPair.privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;
    const pubJwk = keyPair.publicKey.export({
      format: "jwk",
    }) as Record<string, unknown>;
    plaidJwk = {
      kty: pubJwk.kty,
      crv: pubJwk.crv,
      x: pubJwk.x,
      y: pubJwk.y,
      alg: "ES256",
      use: "sig",
      kid: "test-kid",
    };
    plaidClient = {
      webhookVerificationKeyGet: vi
        .fn()
        .mockImplementation(async ({ key_id }: { key_id: string }) => {
          if (key_id !== "test-kid") {
            throw new Error("key not found");
          }
          return { data: { key: plaidJwk } };
        }),
    };
  });

  function signToken(
    payload: Record<string, unknown>,
    opts?: { kid?: string; alg?: string; noTimestamp?: boolean; key?: string },
  ): string {
    return jwt.sign(payload as jwt.JwtPayload, opts?.key ?? privateKeyPem, {
      algorithm: (opts?.alg ?? "ES256") as jwt.Algorithm,
      ...(opts?.noTimestamp ? { noTimestamp: true } : {}),
      header: {
        alg: opts?.alg ?? "ES256",
        kid: opts?.kid ?? "test-kid",
        typ: "JWT",
      },
    });
  }

  function freshIat(): number {
    return Math.floor(Date.now() / 1000);
  }

  it("accepts a valid ES256 webhook token with matching body hash", async () => {
    const iat = freshIat();
    const bodyHash = sha256Hex(RAW_BODY);
    const token = signToken({ iat, request_body_sha256: bodyHash });

    const result = await verifyPlaidWebhook(
      plaidClient as any,
      RAW_BODY,
      token,
    );

    expect(result.valid).toBe(true);
    expect(result.payload).toEqual({
      iat,
      request_body_sha256: bodyHash,
    });
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledWith({
      key_id: "test-kid",
    });
  });

  it("rejects when the verification header is missing or blank", async () => {
    for (const header of [undefined, "", "   "]) {
      const result = await verifyPlaidWebhook(
        plaidClient as any,
        RAW_BODY,
        header,
      );
      expect(result).toEqual({ valid: false });
    }
    expect(plaidClient.webhookVerificationKeyGet).not.toHaveBeenCalled();
  });

  it("rejects tokens that are not parseable JWTs", async () => {
    await expect(
      verifyPlaidWebhook(plaidClient as any, RAW_BODY, "not-a-jwt"),
    ).resolves.toEqual({ valid: false });
    await expect(
      verifyPlaidWebhook(plaidClient as any, RAW_BODY, "onlyonepart"),
    ).resolves.toEqual({ valid: false });
    expect(plaidClient.webhookVerificationKeyGet).not.toHaveBeenCalled();
  });

  it("rejects tokens whose alg is not ES256 before fetching the key", async () => {
    const token = signToken(
      {
        iat: freshIat(),
        request_body_sha256: sha256Hex(RAW_BODY),
      },
      { alg: "HS256", key: "symmetric-secret-for-hs256" },
    );

    const result = await verifyPlaidWebhook(plaidClient as any, RAW_BODY, token);

    expect(result).toEqual({ valid: false });
    expect(plaidClient.webhookVerificationKeyGet).not.toHaveBeenCalled();
  });

  it("rejects tokens without a kid header", async () => {
    const iat = freshIat();
    // Sign with no kid in the protected header.
    const token = jwt.sign(
      { iat, request_body_sha256: sha256Hex(RAW_BODY) } as jwt.JwtPayload,
      privateKeyPem,
      { algorithm: "ES256", header: { alg: "ES256", typ: "JWT" } },
    );

    const result = await verifyPlaidWebhook(plaidClient as any, RAW_BODY, token);

    expect(result).toEqual({ valid: false });
    expect(plaidClient.webhookVerificationKeyGet).not.toHaveBeenCalled();
  });

  it("rejects when the key lookup for the kid fails", async () => {
    const token = signToken(
      { iat: freshIat(), request_body_sha256: sha256Hex(RAW_BODY) },
      { kid: "unknown-kid" },
    );

    const result = await verifyPlaidWebhook(plaidClient as any, RAW_BODY, token);

    expect(result).toEqual({ valid: false });
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledWith({
      key_id: "unknown-kid",
    });
  });

  it("rejects when the fetched key is not a valid JWK", async () => {
    plaidClient.webhookVerificationKeyGet.mockResolvedValue({
      data: { key: { kty: "RSA" } },
    });
    const token = signToken({
      iat: freshIat(),
      request_body_sha256: sha256Hex(RAW_BODY),
    });

    const result = await verifyPlaidWebhook(plaidClient as any, RAW_BODY, token);

    expect(result).toEqual({ valid: false });
  });

  it("rejects a token signed with a different key (tampered signature)", async () => {
    const otherKey = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const otherPrivatePem = otherKey.privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;
    const token = signToken(
      { iat: freshIat(), request_body_sha256: sha256Hex(RAW_BODY) },
      { key: otherPrivatePem },
    );

    const result = await verifyPlaidWebhook(plaidClient as any, RAW_BODY, token);

    expect(result).toEqual({ valid: false });
  });

  it("rejects when the request body hash does not match the claimed hash", async () => {
    const token = signToken({
      iat: freshIat(),
      request_body_sha256: sha256Hex(RAW_BODY),
    });

    const tamperedBody = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "attacker-item",
    });

    const result = await verifyPlaidWebhook(
      plaidClient as any,
      tamperedBody,
      token,
    );

    expect(result).toEqual({ valid: false });
  });

  it("rejects when the claimed hash has the wrong length", async () => {
    const token = signToken({
      iat: freshIat(),
      request_body_sha256: "abcd",
    });

    const result = await verifyPlaidWebhook(plaidClient as any, RAW_BODY, token);

    expect(result).toEqual({ valid: false });
  });

  it("rejects tokens older than the 5 minute freshness window", async () => {
    const staleIat = freshIat() - 6 * 60; // 6 minutes ago > 5 minute max age
    const token = signToken({
      iat: staleIat,
      request_body_sha256: sha256Hex(RAW_BODY),
    });

    const result = await verifyPlaidWebhook(plaidClient as any, RAW_BODY, token);

    expect(result).toEqual({ valid: false });
  });

  it("rejects tokens without an iat claim", async () => {
    const token = signToken(
      { request_body_sha256: sha256Hex(RAW_BODY) },
      { noTimestamp: true },
    );

    const result = await verifyPlaidWebhook(plaidClient as any, RAW_BODY, token);

    expect(result).toEqual({ valid: false });
  });
});
