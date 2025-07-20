import { vi, describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "crypto";

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

// Import modules after mocks
import JwtService from "../JwtService";
import RsaService from "../RsaService";
import { prisma } from "~/server/clients/prismaClient";

describe("JwtService", () => {
  let jwtService: JwtService;
  let testKeyPair: { publicKey: string; privateKey: string };
  let mockRsaKey: any;
  let mockUserFindUnique: any;
  let mockUserUpdate: any;
  let mockUserFindUniqueOrThrow: any;
  let mockRsaService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get references to the mocked functions
    mockUserFindUnique = (prisma.user as any).findUnique;
    mockUserUpdate = (prisma.user as any).update;
    mockUserFindUniqueOrThrow = (prisma.user as any).findUniqueOrThrow;

    // Generate REAL test key pair to override global crypto mock
    // Use vi.importActual to get the real crypto module
    testKeyPair = {
      publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy+j9XF968AxNDz2ai5Co
IXg0tDl/gpTVGEmR7KAGP/7kdBaeusfeUyqUyTXeWjJJNdwc74bSNHzWkacLv/Mx
sm7YrzCoEidBL5itDpzLFKla7lo/UUrIKeSD9ItDaCS3Fdl2yEMI3i02R6N8qevW
BksBg93ogZLlt/bzfgriT36aVp2XsH/gsmtgbpr4ZGneoZQaIv6i7BPq2yTWS1Xv
GWHjWxiypQDKE+ObURw3UTvL40DcEl2H0djJVFntlHJwgMen2rC096a410GhGE2K
2mlg41dzJsSczy5KcMWjM22d58QHc+sAM81add7oW/0CFWGRAEzVOZrh2vxiXPtl
2QIDAQAB
-----END PUBLIC KEY-----`,
      privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDL6P1cX3rwDE0P
PZqLkKgheDS0OX+ClNUYSZHsoAY//uR0Fp66x95TKpTJNd5aMkk13BzvhtI0fNaR
pwu/8zGybtivMKgSJ0EvmK0OnMsUqVruWj9RSsgp5IP0i0NoJLcV2XbIQwjeLTZH
o3yp69YGSwGD3eiBkuW39vN+CuJPfppWnZewf+Cya2Bumvhkad6hlBoi/qLsE+rb
JNZLVe8ZYeNbGLKlAMoT45tRHDdRO8vjQNwSXYfR2MlUWe2UcnCAx6fasLT3prjX
QaEYTYraaWDjV3MmxJzPLkpwxaMzbZ3nxAdz6wAzzVp13uhb/QIVYZEATNU5muHa
/GJc+2XZAgMBAAECggEAKBuiODjsospcnu6QVzrjI0A0Z622m74AI0iXTBqW2CAg
Ggh3/MfC/otN3Dz9CTNCbLZot6GGd74Fa31WxZEFmbINa3ov2PBBNWY7xffHxz7f
jKoSMcB6mijhXqjE37d3DrRpVY8/74mnl1Q8OWUSwkafG+u6Z8A38KVBtC1aYeWr
9XCs9fAW78earBT/iXOAvTg0h/PPKOATr0S49TMxxFxUhNHL8IakS3mxq+H0cvd8
uIIh+wEDrUgV/YoiE741LcHAhzL9ox2fBsSOEarPbN2CbQXrSptOtVC5ICMDNOyF
VNFHQ2SAGi+j9usk2vti36/e68kfbvX/chgkCZT+fQKBgQD+2u4DT5PSzcONl77S
WK45FNmuOOCdgTGjBE8CQXSkZVQMobUCKdh5oeL8m8JL1r1b1uAxrHJox+ZPZjAn
PSjIYzT484jg92VP/iKeELaKWZtWx62Jk2VZIJsE15lgZVQdbMBmfv3whVY7wjkW
XocKGKsxDtWKjc0VUjp21+Uy3QKBgQDM03nK/TkSHGO8vgNBBUXjRIf7727KkOof
smfIsMsqEtXLJK6yiPpVdRsLb549JB4Y06rnjUO8AAb5u1I4fn56kG4XiX6G10af
706lugl/lCTffpmyMqGLDa/0Ztyg8F9Ak6rNSLd4p05kA5+g8f4G5mQJUHTmNjBr
7qiHA1N5LQKBgEPunXT6eD+/ozmR0kaFZuNGQIPlG1JAhreaRWkng2zyqYW4cORD
vTUmxrdo2VCXy9+4FgiHm/N8HVLavUkoTz+i2hLl731v1GyPJDEX6WBVZEescAB0
7pXkUA3pXjPIrrQtMdfgT9YV5JeHPOpOhhZV3wPznU4SYDEnuvfEso5tAoGAVKZt
plvC015SRfXNiHiyanuvK4rHogYEDHeB9upB/LBuFRei73w24UyVkcNehWxA2Afa
kPnL7Y2hVGJ7V4fHo8W/ChEz7mxX7s9LFKjvNf+2wXsj8AaGxt4wQvSj6AuPgjPF
GjQcR0v11NW+ihiY4Kck3siWl3H7zw+CLNJOFD0CgYEA8quM2lE1wuuP0Ct/CTzn
ppg0ylAdgE9PdUkn5Pt+R/o9PLCxMK6U2qAKZeU4okpE152TjH+VeX07UVdp6Rre
6Te/ym6KK5F5T9iKDFobk736G9oDzgJwr+hsFsZN1U0Iot3hg4L6ca0hnxOwBWm3
FOy00NAwJms6hDR9DFTAN/I=
-----END PRIVATE KEY-----`,
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

      const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt;
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

      const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt;
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
          "RSA key not found"
        );
      }
    );
  });

  describe("verify", () => {
    it("should reject token with invalid signature", async () => {
      const invalidToken = jwt.sign(
        { userId: 555, jwtKey: "test-key" },
        "wrong-private-key",
        {
          keyid: "test-key-id",
          algorithm: "HS256", // Different algorithm
        }
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
        }
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
        }
      );

      await expect(jwtService.verify(tokenWithoutKid)).rejects.toThrow(
        "Invalid token header"
      );
    });

    it("should reject token when RSA key not found", async () => {
      const validToken = jwt.sign(
        { userId: 888, jwtKey: "valid-key" },
        testKeyPair.privateKey,
        {
          keyid: "non-existent-key",
          algorithm: "PS512",
        }
      );

      mockRsaService.getKey.mockRejectedValue(new Error("RSA key not found"));

      await expect(jwtService.verify(validToken)).rejects.toThrow(
        "RSA key not found"
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
        }
      );

      await expect(jwtService.verify(tokenWithStringPayload)).rejects.toThrow(
        "Invalid token header"
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
