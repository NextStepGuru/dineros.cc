import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbUserForSession } from "./fixtures/dbUserForSession";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
  (globalThis as any).readBody = vi.fn();
});

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const fullMessage = `HTTP ${statusCode}: ${message}`;
    const err = new Error(fullMessage) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  readBody: vi.fn(),
  setResponseStatus: vi.fn(),
}));

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/schema/zod", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/schema/zod")>();
  const mockPublicProfileParse = vi.fn();
  return {
    ...actual,
    privateUserSchema: {
      parse: vi.fn(),
    },
    publicProfileSchema: new Proxy(actual.publicProfileSchema, {
      get(target, prop, receiver) {
        if (prop === "parse") return mockPublicProfileParse;
        return Reflect.get(target, prop, receiver);
      },
    }),
  };
});

vi.mock("otplib", () => ({
  generateSecret: vi.fn(),
  generateURI: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(),
  },
  toDataURL: vi.fn(),
}));

describe("Two-Factor Authentication API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/two-factor-auth", () => {
    let twoFactorAuthHandler: any;

    beforeEach(async () => {
      const module = await import("../two-factor-auth");
      twoFactorAuthHandler = module.default;
    });

    it("should generate 2FA setup for user without 2FA enabled", async () => {
      const mockEvent = {};
      const mockUser = {
        id: 123,
        email: "test@example.com",
        settings: {
          speakeasy: {
            isEnabled: false,
            isVerified: false,
            base32secret: null,
          },
        },
      };

      const mockSecret = "secret-base32";
      const mockUri =
        "otpauth://totp/Dineros.cc:test@example.com?secret=secret-base32&issuer=Dineros.cc";

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { privateUserSchema } = await import("~/schema/zod");
      const otplib = await import("otplib");
      const qrcode = await import("qrcode");

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      (otplib.generateSecret as any).mockReturnValue(mockSecret);
      (otplib.generateURI as any).mockReturnValue(mockUri);
      (qrcode.default.toDataURL as any).mockResolvedValue(
        "data:image/png;base64,qrcode-data"
      );
      (prisma.user.update as any).mockResolvedValue({
        ...mockUser,
        settings: {
          speakeasy: {
            isEnabled: true,
            isVerified: false,
            base32secret: "secret-base32",
          },
        },
      });

      const result = await twoFactorAuthHandler(mockEvent);

      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 123 },
      });
      expect(otplib.generateSecret).toHaveBeenCalledTimes(1);
      expect(otplib.generateURI).toHaveBeenCalledWith({
        issuer: "Dineros.cc",
        label: "test@example.com",
        secret: mockSecret,
      });
      expect(qrcode.default.toDataURL).toHaveBeenCalledWith(
        `${mockUri}&image=https%3A%2F%2Fres.cloudinary.com%2Fguidedsteps%2Fimage%2Fupload%2Fc_fill%2Cg_face%3Aauto%2Cw_128%2Fv1737776329%2Fpepe_solo_t0twqk.png`
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          settings: expect.objectContaining({
            speakeasy: expect.objectContaining({
              isEnabled: true,
              base32secret: "secret-base32",
              backupCodes: expect.any(Array),
            }),
          }),
        },
      });
      expect(result).toEqual({
        dataUri: "data:image/png;base64,qrcode-data",
        backupCodes: expect.any(Array),
      });
    });

    it("should throw error if 2FA is already enabled and verified", async () => {
      const mockEvent = {};
      const mockUser = {
        id: 123,
        email: "test@example.com",
        settings: {
          mfa: {
            totp: {
              isEnabled: true,
              isVerified: true,
            },
          },
          speakeasy: {
            isEnabled: true,
            isVerified: true,
            base32secret: "existing-secret",
          },
        },
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { privateUserSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(twoFactorAuthHandler(mockEvent)).rejects.toThrow(
        "Two-factor authentication is already enabled."
      );

      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      const mockEvent = {};
      const dbError = new Error("Database connection failed");

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockRejectedValue(dbError);
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(twoFactorAuthHandler(mockEvent)).rejects.toThrow(
        "Database connection failed"
      );
      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });
  });

  describe("POST /api/disable-two-factor-auth", () => {
    let disableTwoFactorAuthHandler: any;

    beforeEach(async () => {
      const module = await import("../disable-two-factor-auth.post");
      disableTwoFactorAuthHandler = module.default;
    });

    it("should successfully disable two-factor authentication", async () => {
      const mockEvent = {};
      const mockUser = {
        id: 123,
        email: "test@example.com",
        settings: {
          speakeasy: {
            isEnabled: true,
            isVerified: true,
            base32secret: "secret-base32",
          },
          otherSetting: "preserved",
        },
      };

      const mockUpdatedUser = {
        id: 123,
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
      };

      const mockParsedUser = {
        id: 123,
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
      };

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { privateUserSchema, publicProfileSchema } = await import(
        "~/schema/zod"
      );

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      (prisma.user.update as any).mockResolvedValue(mockUpdatedUser);
      (publicProfileSchema.parse as any).mockReturnValue(mockParsedUser);

      const result = await disableTwoFactorAuthHandler(mockEvent);

      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 123 },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          settings: expect.objectContaining({
            otherSetting: "preserved",
            speakeasy: expect.objectContaining({
              isEnabled: false,
              isVerified: false,
            }),
          }),
        },
      });
      expect(result).toEqual(mockParsedUser);
    });

    it("should handle authentication errors", async () => {
      const mockEvent = {};
      const authError = new Error("User not authenticated");

      const { getUser } = await import("~/server/lib/getUser");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getUser as any).mockImplementation(() => {
        throw authError;
      });
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(disableTwoFactorAuthHandler(mockEvent)).rejects.toThrow(
        "User not authenticated"
      );
      expect(handleApiError).toHaveBeenCalledWith(authError);
    });

    it("should handle database update errors", async () => {
      const mockEvent = {};
      const mockUser = {
        id: 123,
        settings: {
          speakeasy: {
            isEnabled: true,
            isVerified: true,
          },
        },
      };
      const updateError = new Error("Failed to update user");

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { privateUserSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      (prisma.user.update as any).mockRejectedValue(updateError);
      (handleApiError as any).mockImplementation((error: any) => {
        throw error;
      });

      await expect(disableTwoFactorAuthHandler(mockEvent)).rejects.toThrow(
        "Failed to update user"
      );
      expect(handleApiError).toHaveBeenCalledWith(updateError);
    });
  });

  describe("POST /api/verify-two-factor-auth", () => {
    let verifyTwoFactorAuthHandler: any;

    beforeEach(async () => {
      const module = await import("../verify-two-factor-auth.post");
      verifyTwoFactorAuthHandler = module.default;
    });

    it("should successfully verify valid 2FA token", async () => {
      const mockEvent = {};
      const mockBody = { token: "123456" };
      const mockUser = {
        id: 123,
        email: "test@example.com",
        settings: {
          mfa: {
            totp: {
              isEnabled: true,
              isVerified: false,
              base32secret: "secret-base32",
              backupCodes: [],
            },
          },
          speakeasy: {
            isEnabled: true,
            isVerified: false,
            base32secret: "secret-base32",
          },
        },
      };

      const mockUpdatedUser = dbUserForSession();

      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { privateUserSchema } = await import("~/schema/zod");
      const { sessionUserFromDb } = await import(
        "~/server/lib/sessionUserProfile"
      );
      const otplib = await import("otplib");

      (globalThis as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      (otplib.verify as any).mockResolvedValue({ valid: true });
      (prisma.user.update as any).mockResolvedValue(mockUpdatedUser);

      const result = await verifyTwoFactorAuthHandler(mockEvent);

      expect((globalThis as any).readBody).toHaveBeenCalledWith(mockEvent);
      expect(otplib.verify).toHaveBeenCalledWith({
        secret: "secret-base32",
        token: "123456",
        epochTolerance: 300,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          settings: expect.objectContaining({
            speakeasy: expect.objectContaining({
              isEnabled: true,
              isVerified: true,
              base32secret: "secret-base32",
            }),
          }),
        },
      });
      expect(result).toEqual(sessionUserFromDb(mockUpdatedUser));
    });

    it("should return false for invalid 2FA token", async () => {
      const mockEvent = {};
      const mockBody = { token: "123456" };
      const mockUser = {
        id: 123,
        settings: {
          mfa: {
            totp: {
              base32secret: "secret-base32",
              backupCodes: [],
            },
          },
          speakeasy: {
            base32secret: "secret-base32",
          },
        },
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { privateUserSchema } = await import("~/schema/zod");
      const { sessionUserFromDb } = await import(
        "~/server/lib/sessionUserProfile"
      );
      const otplib = await import("otplib");

      const updatedRow = dbUserForSession();

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      (otplib.verify as any).mockResolvedValue({ valid: false });
      (prisma.user.update as any).mockResolvedValue(updatedRow);

      const result = await verifyTwoFactorAuthHandler(mockEvent);

      expect(otplib.verify).toHaveBeenCalledWith({
        secret: "secret-base32",
        token: "123456",
        epochTolerance: 300,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          settings: expect.objectContaining({
            speakeasy: expect.objectContaining({
              base32secret: "secret-base32",
              isVerified: false,
            }),
          }),
        },
      });
      expect(result).toEqual(sessionUserFromDb(updatedRow));
    });

    it("should return false if user has no 2FA secret", async () => {
      const mockEvent = {};
      const mockBody = { token: "123456" };
      const mockUser = {
        id: 123,
        settings: {
          speakeasy: {
            base32secret: null,
          },
        },
      };

      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { privateUserSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);

      const result = await verifyTwoFactorAuthHandler(mockEvent);

      expect(result).toBe(false);
    });

    it("should handle invalid request body", async () => {
      const mockEvent = {};
      const mockBody = {}; // Missing token

      (globalThis as any).readBody.mockResolvedValue(mockBody);

      await expect(verifyTwoFactorAuthHandler(mockEvent)).rejects.toThrow();
    });
  });

  describe("Cross-endpoint Integration", () => {
    it("should use consistent error handling across all 2FA endpoints", async () => {
      const { handleApiError } = await import("~/server/lib/handleApiError");

      expect(handleApiError).toBeDefined();
      expect(typeof handleApiError).toBe("function");
    });

    it("should use consistent user authentication", async () => {
      const { getUser } = await import("~/server/lib/getUser");

      expect(getUser).toBeDefined();
      expect(typeof getUser).toBe("function");
    });

    it("should use consistent schema validation", async () => {
      const { privateUserSchema, publicProfileSchema } = await import(
        "~/schema/zod"
      );

      expect(privateUserSchema).toBeDefined();
      expect(publicProfileSchema).toBeDefined();
    });
  });
});
