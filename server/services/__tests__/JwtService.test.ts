import { randomBytes } from "node:crypto";
import { vi, describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// Import modules after mocks
import JwtService from "../JwtService";
import RsaService from "../RsaService";
import { prisma } from "~/server/clients/prismaClient";

// Mock prisma client (used by both JwtService and RsaService)
vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    rsa: {
      findFirstOrThrow: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

// Mock RsaService to return properly formatted keys
vi.mock("../RsaService", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getLatestKey: vi.fn(),
      getKey: vi.fn(),
    })),
  };
});

describe("JwtService", () => {
  let jwtService: JwtService;
  let testKeyPair: { publicKey: string; privateKey: string };
  let mockRsaKey: any;
  let mockUserFindUnique: any;
  let mockUserUpdate: any;
  let mockUserFindUniqueOrThrow: any;
  let mockRsaService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { generateKeyPairSync } = await vi.importActual<
      typeof import("node:crypto")
    >("node:crypto");

    // Get references to the mocked functions
    mockUserFindUnique = (prisma.user as any).findUnique;
    mockUserUpdate = (prisma.user as any).update;
    mockUserFindUniqueOrThrow = (prisma.user as any).findUniqueOrThrow;

    const pair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    testKeyPair = {
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
    };

    mockRsaKey = {
      id: "test-key-id",
      publicKey: testKeyPair.publicKey,
      privateKey: testKeyPair.privateKey,
      isDefault: true,
      isArchived: false,
    };

    // Mock RsaService instance methods
    mockRsaService = {
      getLatestKey: vi.fn().mockResolvedValue(mockRsaKey),
      getKey: vi.fn().mockResolvedValue(mockRsaKey),
    };

    // Make RsaService constructor return our mocked instance
    (RsaService as any).mockImplementation(() => mockRsaService);

    jwtService = new JwtService();
  });

  describe("sign", () => {
    it("should create JWT token for existing user with jwtKey", async () => {
      const userId = 123;
      const user = { id: userId, jwtKey: "existing-jwt-key" };

      // Mock the user lookup
      mockUserFindUnique.mockResolvedValue(user);

      const token = await jwtService.sign({ userId });

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");

      const decoded = jwt.decode(token, { complete: true });
      if (decoded === null) {
        throw new Error("expected decoded JWT");
      }
      expect(decoded.payload).toMatchObject({
        userId: userId,
        jwtKey: "existing-jwt-key",
      });

      expect(mockUserFindUnique).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockUserUpdate).not.toHaveBeenCalled();
      expect(mockRsaService.getLatestKey).toHaveBeenCalled();
    });

    it("should create JWT token for user without jwtKey", async () => {
      const userId = 456;
      const userWithoutJwtKey = { id: userId, jwtKey: null };
      const updatedUser = {
        id: userId,
        jwtKey: "new-jwt-key",
        email: "test@example.com",
      };

      mockUserFindUnique.mockResolvedValue(userWithoutJwtKey);
      mockUserUpdate.mockResolvedValue(updatedUser);

      const token = await jwtService.sign({ userId });

      expect(token).toBeDefined();

      const decoded = jwt.decode(token, { complete: true });
      if (decoded === null) {
        throw new Error("expected decoded JWT");
      }
      expect(decoded.payload).toMatchObject({
        userId: userId,
        jwtKey: "new-jwt-key",
      });

      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          jwtKey: expect.any(String),
        },
      });
      expect(mockRsaService.getLatestKey).toHaveBeenCalled();
    });

    it.runIf(process.env.RUN_SLOW_TESTS === "true")(
      "should handle error when getting RSA key",
      async () => {
        const userId = 111;
        const user = { id: userId, jwtKey: "test-jwt-key" };
        const rsaError = new Error("RSA key not found");

        mockUserFindUnique.mockResolvedValue(user);
        mockRsaService.getLatestKey.mockRejectedValue(rsaError);

        await expect(jwtService.sign({ userId })).rejects.toThrow(
          "RSA key not found",
        );
      },
    );
  });

  describe("verify", () => {
    it("should reject token with invalid signature", async () => {
      const invalidHmacSecret = randomBytes(32).toString("base64url");
      const invalidToken = jwt.sign(
        { userId: 555, jwtKey: "test-key" },
        invalidHmacSecret,
        {
          keyid: "test-key-id",
          algorithm: "HS256", // Different algorithm
        },
      );

      mockUserFindUniqueOrThrow.mockResolvedValue({
        id: 555,
        jwtKey: "test-key",
      });

      await expect(jwtService.verify(invalidToken)).rejects.toThrow();
    });

    it("should reject expired token", async () => {
      // Create token that's already expired using the real RSA key
      const expiredToken = jwt.sign(
        { userId: 666, jwtKey: "expired-key" },
        testKeyPair.privateKey,
        {
          keyid: "test-key-id",
          algorithm: "PS512",
          expiresIn: "-1h", // Already expired
        },
      );

      mockUserFindUniqueOrThrow.mockResolvedValue({
        id: 666,
        jwtKey: "expired-key",
      });

      await expect(jwtService.verify(expiredToken)).rejects.toThrow();
    });

    it("should reject token without kid header", async () => {
      const tokenWithoutKid = jwt.sign(
        { userId: 777, jwtKey: "no-kid-key" },
        testKeyPair.privateKey,
        {
          algorithm: "PS512",
          // No keyid provided
        },
      );

      await expect(jwtService.verify(tokenWithoutKid)).rejects.toThrow(
        "Invalid token header",
      );
    });

    it("should reject token when RSA key not found", async () => {
      const validToken = jwt.sign(
        { userId: 888, jwtKey: "valid-key" },
        testKeyPair.privateKey,
        {
          keyid: "non-existent-key",
          algorithm: "PS512",
        },
      );

      mockRsaService.getKey.mockRejectedValue(new Error("RSA key not found"));

      await expect(jwtService.verify(validToken)).rejects.toThrow(
        "RSA key not found",
      );
    });

    it("should handle malformed token gracefully", async () => {
      const malformedToken = "not.a.valid.jwt.token";

      await expect(jwtService.verify(malformedToken)).rejects.toThrow();
    });

    it("should handle empty token", async () => {
      await expect(jwtService.verify("")).rejects.toThrow();
    });

    it("should verify token with string payload", async () => {
      const tokenWithStringPayload = jwt.sign(
        "string-payload", // Non-object payload
        testKeyPair.privateKey,
        {
          keyid: "test-key-id",
          algorithm: "PS512",
          // Note: expiresIn not allowed with string payload
        },
      );

      await expect(jwtService.verify(tokenWithStringPayload)).rejects.toThrow(
        "Invalid token header",
      );
    });

    it("should successfully verify valid token", async () => {
      const userId = 999;
      const jwtKey = "valid-jwt-key";

      // Create a valid token using the real RSA key
      const validToken = jwt.sign({ userId, jwtKey }, testKeyPair.privateKey, {
        keyid: "test-key-id",
        algorithm: "PS512",
        expiresIn: "1h",
      });

      mockUserFindUniqueOrThrow.mockResolvedValue({
        id: userId,
        jwtKey: jwtKey,
      });

      const decoded = await jwtService.verify(validToken);

      expect(decoded).toMatchObject({
        userId,
        jwtKey,
      });
      expect(mockRsaService.getKey).toHaveBeenCalledWith({
        kid: "test-key-id",
      });
      expect(mockUserFindUniqueOrThrow).toHaveBeenCalledWith({
        where: { jwtKey },
      });
    });
  });
});
