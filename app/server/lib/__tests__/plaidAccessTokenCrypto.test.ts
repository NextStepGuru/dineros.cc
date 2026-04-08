import { describe, it, expect, vi } from "vitest";

vi.mock("~/server/env", () => ({
  default: { DB_ENCRYPTION_KEY: "fixture-db-encryption-key-for-tests-only" },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import {
  decryptPlaidAccessTokenFromSettings,
  encryptPlaidAccessTokenForSettings,
  resolvePlaidAccessTokenFromStored,
} from "~/server/lib/plaidAccessTokenCrypto";

describe("plaidAccessTokenCrypto", () => {
  it("encrypts and decrypts round-trip", () => {
    const plain = "access-sandbox-test-token";
    const stored = encryptPlaidAccessTokenForSettings(plain);
    expect(stored.startsWith("access-")).toBe(false);
    expect(decryptPlaidAccessTokenFromSettings(stored)).toBe(plain);
  });

  it("resolvePlaidAccessTokenFromStored returns legacy plaintext access- tokens", () => {
    expect(resolvePlaidAccessTokenFromStored("access-plain")).toBe(
      "access-plain",
    );
  });

  it("resolvePlaidAccessTokenFromStored decrypts encrypted settings blobs", () => {
    const plain = "access-sandbox-roundtrip";
    const enc = encryptPlaidAccessTokenForSettings(plain);
    expect(resolvePlaidAccessTokenFromStored(enc)).toBe(plain);
  });
});
