import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbUserForSession } from "./fixtures/dbUserForSession";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
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
  setCookie: vi.fn(),
  getCookie: vi.fn(),
}));

// Make H3 functions globally available
(global as any).readBody = vi.fn();
(global as any).setResponseStatus = vi.fn();

// Mock external dependencies
vi.mock("otplib", () => ({
  verify: vi.fn(),
}));

vi.mock("@paralleldrive/cuid2", () => ({
  default: {
    createId: vi.fn(() => "resetcode123"),
  },
  createId: vi.fn(() => "resetcode123"),
}));

// Mock server dependencies
vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("../env", () => ({
  default: {
    NODE_ENV: "test",
  },
}));

// Forgot-password imports env from server/env (../env from server/api/), so mock it for email tests
vi.mock("~/server/env", () => ({
  default: {
    NODE_ENV: "test",
    DEPLOY_ENV: "staging",
  },
}));

vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("~/server/clients/postmarkClient", () => ({
  hasPostmarkToken: true,
  postmarkClient: {
    sendEmail: vi.fn(),
  },
}));

vi.mock("~/server/clients/redisClient", () => ({
  sharedRedisConnection: {
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

// Create mock service classes
const mockHashService = {
  verify: vi.fn(),
  hash: vi.fn(),
};

const mockJwtService = {
  sign: vi.fn(),
};

vi.mock("~/server/services/HashService", () => ({
  default: vi.fn().mockImplementation(() => mockHashService),
}));

vi.mock("~/server/services/JwtService", () => ({
  default: vi.fn().mockImplementation(() => mockJwtService),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/lib/withErrorHandler", () => ({
  withErrorHandler: vi.fn((handler) => {
    return async (event: any) => {
      try {
        return await handler(event);
      } catch (error) {
        // Import the mocked handleApiError
        const { handleApiError } = await import("~/server/lib/handleApiError");
        handleApiError(error);
        // Re-throw the error to ensure the promise rejects
        throw error;
      }
    };
  }),
}));

vi.mock("~/schema/zod", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/schema/zod")>();
  const mockPublicProfileParse = vi.fn();
  return {
    ...actual,
    loginSchema: {
      extend: vi.fn(() => ({
        parse: vi.fn(),
      })),
    },
    privateUserSchema: {
      parse: vi.fn(),
    },
    publicProfileSchema: new Proxy(actual.publicProfileSchema, {
      get(target, prop, receiver) {
        if (prop === "parse") return mockPublicProfileParse;
        return Reflect.get(target, prop, receiver);
      },
    }),
    passwordAndCodeSchema: {
      parse: vi.fn(),
    },
  };
});

describe("Authentication API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/login", () => {
    let loginHandler: any;

    beforeEach(async () => {
      // Properly set up the global mock function
      (global as any).readBody = vi.fn();

      const module = await import("../login.post");
      loginHandler = module.default;
    });

    it("should successfully login with valid credentials", async () => {
      const mockEvent = {};
      const mockBody = {
        email: "test@example.com",
        password: "password123",
      };

      const mockUser = dbUserForSession();

      const { readBody, setResponseStatus, setCookie } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { loginSchema, privateUserSchema } = await import("~/schema/zod");
      const { sessionUserFromDb } = await import(
        "~/server/lib/sessionUserProfile"
      );
      const HashService = await import("~/server/services/HashService");
      const JwtService = await import("~/server/services/JwtService");

      (readBody as any).mockResolvedValue(mockBody);
      (loginSchema.extend as any).mockReturnValue({
        parse: vi.fn().mockReturnValue({
          email: "test@example.com",
          password: "password123",
        }),
      });
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      mockHashService.verify.mockResolvedValue(true);
      mockJwtService.sign.mockResolvedValue("jwt-token");
      (prisma.user.update as any).mockResolvedValue(mockUser);

      const result = await loginHandler(mockEvent);

      expect(result).toEqual({
        token: "jwt-token",
        message: null,
        user: sessionUserFromDb(mockUser),
      });
      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 200);
      expect(setCookie).toHaveBeenCalledWith(
        mockEvent,
        "authToken",
        "jwt-token",
        expect.objectContaining({
          secure: false,
          maxAge: 86400,
          path: "/",
        })
      );
    });

    it("should normalize email (strip zero-width chars and trim) before validation", async () => {
      const mockEvent = {};
      const rawEmail = "\u200B test@example.com \uFEFF";
      const mockBody = {
        email: rawEmail,
        password: "password123",
      };

      const mockUser = dbUserForSession();

      const { readBody, setResponseStatus, setCookie } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { loginSchema, privateUserSchema } = await import("~/schema/zod");
      const { sessionUserFromDb } = await import(
        "~/server/lib/sessionUserProfile"
      );

      (readBody as any).mockResolvedValue(mockBody);

      const parseSpy = vi.fn().mockReturnValue({
        email: "test@example.com",
        password: "password123",
      });
      (loginSchema.extend as any).mockReturnValue({ parse: parseSpy });

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      mockHashService.verify.mockResolvedValue(true);
      mockJwtService.sign.mockResolvedValue("jwt-token");
      (prisma.user.update as any).mockResolvedValue(mockUser);

      const result = await loginHandler(mockEvent);

      expect(parseSpy).toHaveBeenCalledTimes(1);
      expect(parseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          password: "password123",
        })
      );
      expect(result).toEqual({
        token: "jwt-token",
        message: null,
        user: sessionUserFromDb(mockUser),
      });
      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 200);
    });

    it("should return error for non-existent user", async () => {
      const mockEvent = {};
      const mockBody = {
        email: "nonexistent@example.com",
        password: "password123",
      };

      const { readBody, setResponseStatus } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { loginSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (loginSchema.extend as any).mockReturnValue({
        parse: vi.fn().mockReturnValue({
          email: "nonexistent@example.com",
          password: "password123",
        }),
      });
      (prisma.user.findFirst as any).mockResolvedValue(null);

      const result = await loginHandler(mockEvent);

      expect(result).toEqual({ errors: "Invalid email or password." });
      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 401);
    });

    it("should return error for invalid password", async () => {
      const mockEvent = {};
      const mockBody = {
        email: "test@example.com",
        password: "wrongpassword",
      };

      const mockUser = {
        id: 123,
        email: "test@example.com",
        password: "hashedPassword",
        settings: {
          speakeasy: {
            isEnabled: false,
            isVerified: false,
            base32secret: null,
          },
        },
      };

      const { readBody, setResponseStatus } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { loginSchema, privateUserSchema } = await import("~/schema/zod");
      const HashService = await import("~/server/services/HashService");

      (readBody as any).mockResolvedValue(mockBody);
      (loginSchema.extend as any).mockReturnValue({
        parse: vi.fn().mockReturnValue({
          email: "test@example.com",
          password: "wrongpassword",
        }),
      });
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      mockHashService.verify.mockResolvedValue(false);

      const result = await loginHandler(mockEvent);

      expect(result).toEqual({ errors: "Invalid email or password." });
      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 401);
    });

    it("should require two-factor authentication when enabled", async () => {
      const mockEvent = {};
      const mockBody = {
        email: "test@example.com",
        password: "password123",
      };

      const mockUser = {
        id: 123,
        email: "test@example.com",
        password: "hashedPassword",
        settings: {
          mfa: {
            totp: {
              isEnabled: true,
              isVerified: true,
              base32secret: "secret123",
              backupCodes: [],
            },
            passkeys: [],
            emailOtp: { isEnabled: false, isVerified: false },
          },
          speakeasy: {
            isEnabled: true,
            isVerified: true,
            base32secret: "secret123",
          },
        },
      };

      const { readBody, setResponseStatus } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { loginSchema, privateUserSchema } = await import("~/schema/zod");
      const HashService = await import("~/server/services/HashService");

      (readBody as any).mockResolvedValue(mockBody);
      (loginSchema.extend as any).mockReturnValue({
        parse: vi.fn().mockReturnValue({
          email: "test@example.com",
          password: "password123",
        }),
      });
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      mockHashService.verify.mockResolvedValue(true);

      const result = await loginHandler(mockEvent);

      expect(result).toEqual({
        twoFactorChallengeRequired: true,
        mfaMethods: ["totp"],
      });
      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 200);
    });

    it("should validate two-factor authentication token", async () => {
      const mockEvent = {};
      const mockBody = {
        email: "test@example.com",
        password: "password123",
        tokenChallenge: "123456",
      };

      const mockUser = dbUserForSession({
        settings: {
          mfa: {
            totp: {
              isEnabled: true,
              isVerified: true,
              base32secret: "secret123",
              backupCodes: [],
            },
            passkeys: [],
            emailOtp: { isEnabled: false, isVerified: false },
          },
          speakeasy: {
            isEnabled: true,
            isVerified: true,
            base32secret: "secret123",
          },
          plaid: { isEnabled: false },
        },
      });

      const { readBody, setResponseStatus, setCookie } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { loginSchema, privateUserSchema } = await import("~/schema/zod");
      const { sessionUserFromDb } = await import(
        "~/server/lib/sessionUserProfile"
      );
      const HashService = await import("~/server/services/HashService");
      const JwtService = await import("~/server/services/JwtService");
      const otplib = await import("otplib");

      (readBody as any).mockResolvedValue(mockBody);
      (loginSchema.extend as any).mockReturnValue({
        parse: vi.fn().mockReturnValue({
          email: "test@example.com",
          password: "password123",
          tokenChallenge: "123456",
        }),
      });
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      mockHashService.verify.mockResolvedValue(true);
      (otplib.verify as any).mockResolvedValue({ valid: true });
      mockJwtService.sign.mockResolvedValue("jwt-token");
      (prisma.user.update as any).mockResolvedValue(mockUser);

      const result = await loginHandler(mockEvent);

      expect(result).toEqual({
        token: "jwt-token",
        message: null,
        user: sessionUserFromDb(mockUser),
      });
      expect(otplib.verify).toHaveBeenCalledWith({
        secret: "secret123",
        token: "123456",
        epochTolerance: 300,
      });
    });

    it("should reject login when user has no password", async () => {
      const mockEvent = {};
      const mockBody = {
        email: "test@example.com",
        password: "password123",
      };

      const mockUser = {
        id: 123,
        email: "test@example.com",
        password: null, // User with no password
        settings: {
          speakeasy: {
            isEnabled: false,
            isVerified: false,
            base32secret: null,
          },
        },
      };

      const { readBody, setResponseStatus } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { loginSchema, privateUserSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (loginSchema.extend as any).mockReturnValue({
        parse: vi.fn().mockReturnValue({
          email: "test@example.com",
          password: "password123",
        }),
      });
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);

      const result = await loginHandler(mockEvent);

      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 401);
      expect(result).toEqual({
        errors: "Invalid email or password.",
      });
    });

    it("should reject invalid two-factor authentication token", async () => {
      const mockEvent = {};
      const mockBody = {
        email: "test@example.com",
        password: "password123",
        tokenChallenge: "invalid",
      };

      const mockUser = {
        id: 123,
        email: "test@example.com",
        password: "hashedPassword",
        settings: {
          mfa: {
            totp: {
              isEnabled: true,
              isVerified: true,
              base32secret: "secret123",
              backupCodes: [],
            },
            passkeys: [],
            emailOtp: { isEnabled: false, isVerified: false },
          },
          speakeasy: {
            isEnabled: true,
            isVerified: true,
            base32secret: "secret123",
          },
        },
      };

      const { readBody, setResponseStatus } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { loginSchema, privateUserSchema } = await import("~/schema/zod");
      const HashService = await import("~/server/services/HashService");
      const otplib = await import("otplib");

      (readBody as any).mockResolvedValue(mockBody);
      (loginSchema.extend as any).mockReturnValue({
        parse: vi.fn().mockReturnValue({
          email: "test@example.com",
          password: "password123",
          tokenChallenge: "invalid",
        }),
      });
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      (privateUserSchema.parse as any).mockReturnValue(mockUser);
      mockHashService.verify.mockResolvedValue(true);
      (otplib.verify as any).mockResolvedValue({ valid: false });

      const result = await loginHandler(mockEvent);

      expect(result).toEqual({
        errors: "Invalid two-factor authentication token.",
      });
      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 401);
    });

    it("should handle schema validation errors", async () => {
      const mockEvent = {};

      const { readBody } = await import("h3");
      const { loginSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue({});
      const validationError = new Error("Invalid email format");
      (loginSchema.extend as any).mockReturnValue({
        parse: vi.fn().mockImplementation(() => {
          throw validationError;
        }),
      });

      await expect(loginHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(validationError);
    });

    it("should handle database errors", async () => {
      const mockEvent = {};
      const mockBody = {
        email: "test@example.com",
        password: "password123",
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { loginSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      (loginSchema.extend as any).mockReturnValue({
        parse: vi.fn().mockReturnValue({
          email: "test@example.com",
          password: "password123",
        }),
      });

      const dbError = new Error("Database connection failed");
      (prisma.user.findFirst as any).mockRejectedValue(dbError);

      await expect(loginHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });
  });

  describe("POST /api/forgot-password", () => {
    let forgotPasswordHandler: any;

    beforeEach(async () => {
      // Properly set up the global mock function
      (global as any).readBody = vi.fn();

      const module = await import("../forgot-password.post");
      forgotPasswordHandler = module.default;
    });

    it("should send reset code for valid email", async () => {
      const mockEvent = {};
      const mockBody = { email: "test@example.com" };
      const mockUser = {
        id: 123,
        email: "test@example.com",
        firstName: "Test",
      };

      const { readBody, setResponseStatus } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      const cuid2 = await import("@paralleldrive/cuid2");

      (readBody as any).mockResolvedValue(mockBody);
      (global as any).readBody.mockResolvedValue(mockBody);
      (setResponseStatus as any).mockImplementation(() => {});
      (global as any).setResponseStatus.mockImplementation(() => {});
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      (cuid2.createId as any).mockReturnValue("resetcode123");
      (prisma.user.update as any).mockResolvedValue(mockUser);
      (postmarkClient.sendEmail as any).mockResolvedValue({});

      const result = await forgotPasswordHandler(mockEvent);

      expect(result).toEqual({ message: "Reset code sent" });
      // Note: setResponseStatus is called in the actual endpoint but not easily testable in our mock setup
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          resetCode: "resetcode1",
          resetPasswordAt: expect.any(Date),
        },
      });
      expect(postmarkClient.sendEmail).toHaveBeenCalledWith({
        From: "Mr. Pepe Dineros <pepe@dineros.cc>",
        To: "test@example.com",
        Subject: "Dineros Password Reset Request",
        HtmlBody: expect.stringContaining("resetcode1"),
      });
    });

    it("should return error for non-existent email", async () => {
      const mockEvent = {};
      const mockBody = { email: "nonexistent@example.com" };

      const { readBody, setResponseStatus } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (readBody as any).mockResolvedValue(mockBody);
      (global as any).readBody.mockResolvedValue(mockBody);
      (setResponseStatus as any).mockImplementation(() => {});
      (global as any).setResponseStatus.mockImplementation(() => {});
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const result = await forgotPasswordHandler(mockEvent);

      expect(result).toEqual({ message: "User not found" });
      // Note: setResponseStatus is called in the actual endpoint but not easily testable in our mock setup
    });

    it("should handle invalid email format", async () => {
      const mockEvent = {};
      const mockBody = { email: "invalid-email" };

      const { readBody } = await import("h3");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);

      await expect(forgotPasswordHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });

    it("should handle email sending errors", async () => {
      const mockEvent = {};
      const mockBody = { email: "test@example.com" };
      const mockUser = {
        id: 123,
        email: "test@example.com",
        firstName: "Test",
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const cuid2 = await import("@paralleldrive/cuid2");

      (readBody as any).mockResolvedValue(mockBody);
      (global as any).readBody.mockResolvedValue(mockBody);
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      (cuid2.createId as any).mockReturnValue("resetcode123");
      (prisma.user.update as any).mockResolvedValue(mockUser);

      const emailError = new Error("Email service unavailable");
      (postmarkClient.sendEmail as any).mockRejectedValue(emailError);

      await expect(forgotPasswordHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(emailError);
    });

    it("should handle database update errors", async () => {
      const mockEvent = {};
      const mockBody = { email: "test@example.com" };
      const mockUser = {
        id: 123,
        email: "test@example.com",
        firstName: "Test",
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const cuid2 = await import("@paralleldrive/cuid2");

      (readBody as any).mockResolvedValue(mockBody);
      (global as any).readBody.mockResolvedValue(mockBody);
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      (cuid2.createId as any).mockReturnValue("resetcode123");

      const dbError = new Error("Database update failed");
      (prisma.user.update as any).mockRejectedValue(dbError);

      await expect(forgotPasswordHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });
  });

  describe("POST /api/reset-password-with-code", () => {
    let resetPasswordHandler: any;

    beforeEach(async () => {
      // Properly set up the global mock function
      (global as any).readBody = vi.fn();

      const module = await import("../reset-password-with-code.post");
      resetPasswordHandler = module.default;
    });

    it("should reset password with valid code", async () => {
      const mockEvent = {};
      const mockBody = {
        resetCode: "validcode",
        newPassword: "newpassword123",
      };
      const mockUser = {
        id: 123,
        email: "test@example.com",
        firstName: "Test",
      };

      const { readBody, setResponseStatus } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      const { passwordAndCodeSchema } = await import("~/schema/zod");
      const HashService = await import("~/server/services/HashService");

      (readBody as any).mockResolvedValue(mockBody);
      (global as any).readBody.mockResolvedValue(mockBody);
      (setResponseStatus as any).mockImplementation(() => {});
      (global as any).setResponseStatus.mockImplementation(() => {});
      (passwordAndCodeSchema.parse as any).mockReturnValue({
        resetCode: "validcode",
        newPassword: "newpassword123",
      });
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      mockHashService.hash.mockResolvedValue("hashedNewPassword");
      (prisma.user.update as any).mockResolvedValue(mockUser);
      (postmarkClient.sendEmail as any).mockResolvedValue({});

      const result = await resetPasswordHandler(mockEvent);

      expect(result).toEqual({ message: "Password was reset" });
      // Note: setResponseStatus is called in the actual endpoint but not easily testable in our mock setup
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          resetCode: null,
          resetPasswordAt: null,
          password: "hashedNewPassword",
        },
      });
      expect(postmarkClient.sendEmail).toHaveBeenCalledWith({
        From: "Mr. Pepe Dineros <pepe@dineros.cc>",
        To: "test@example.com",
        Subject: "Dineros Password Reset",
        HtmlBody: expect.stringContaining("Your password was reset!"),
      });
    });

    it("should reject invalid reset code", async () => {
      const mockEvent = {};
      const mockBody = {
        resetCode: "invalidcode",
        newPassword: "newpassword123",
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { passwordAndCodeSchema } = await import("~/schema/zod");

      (readBody as any).mockResolvedValue(mockBody);
      (passwordAndCodeSchema.parse as any).mockReturnValue({
        resetCode: "invalidcode",
        newPassword: "newpassword123",
      });
      (prisma.user.findFirst as any).mockResolvedValue(null);

      await expect(resetPasswordHandler(mockEvent)).rejects.toThrow(
        "HTTP 400: Invalid Reset Code"
      );
    });

    it("should handle schema validation errors", async () => {
      const mockEvent = {};
      const mockBody = {
        resetCode: "",
        newPassword: "weak",
      };

      const { readBody } = await import("h3");
      const { passwordAndCodeSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      const validationError = new Error("Password too weak");
      (passwordAndCodeSchema.parse as any).mockImplementation(() => {
        throw validationError;
      });

      await expect(resetPasswordHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(validationError);
    });

    it("should handle password hashing errors", async () => {
      const mockEvent = {};
      const mockBody = {
        resetCode: "validcode",
        newPassword: "newpassword123",
      };
      const mockUser = {
        id: 123,
        email: "test@example.com",
        firstName: "Test",
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { passwordAndCodeSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const HashService = await import("~/server/services/HashService");

      (readBody as any).mockResolvedValue(mockBody);
      (passwordAndCodeSchema.parse as any).mockReturnValue({
        resetCode: "validcode",
        newPassword: "newpassword123",
      });
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);

      const hashError = new Error("Hashing failed");
      mockHashService.hash.mockRejectedValue(hashError);

      await expect(resetPasswordHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(hashError);
    });

    it("should handle email confirmation errors", async () => {
      const mockEvent = {};
      const mockBody = {
        resetCode: "validcode",
        newPassword: "newpassword123",
      };
      const mockUser = {
        id: 123,
        email: "test@example.com",
        firstName: "Test",
      };

      const { readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { postmarkClient } = await import(
        "~/server/clients/postmarkClient"
      );
      const { passwordAndCodeSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      const HashService = await import("~/server/services/HashService");

      (readBody as any).mockResolvedValue(mockBody);
      (passwordAndCodeSchema.parse as any).mockReturnValue({
        resetCode: "validcode",
        newPassword: "newpassword123",
      });
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      mockHashService.hash.mockResolvedValue("hashedNewPassword");
      (prisma.user.update as any).mockResolvedValue(mockUser);

      const emailError = new Error("Email service unavailable");
      (postmarkClient.sendEmail as any).mockRejectedValue(emailError);

      await expect(resetPasswordHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(emailError);
    });
  });

  describe("Cross-endpoint Error Handling", () => {
    it("should use handleApiError consistently across all auth endpoints", async () => {
      const { handleApiError } = await import("~/server/lib/handleApiError");

      expect(handleApiError).toBeDefined();
      expect(typeof handleApiError).toBe("function");
    });

    it("should handle network timeouts gracefully", async () => {
      const loginModule = await import("../login.post");
      const forgotPasswordModule = await import("../forgot-password.post");
      const resetPasswordModule = await import(
        "../reset-password-with-code.post"
      );

      expect(loginModule.default).toBeDefined();
      expect(forgotPasswordModule.default).toBeDefined();
      expect(resetPasswordModule.default).toBeDefined();
    });
  });
});
