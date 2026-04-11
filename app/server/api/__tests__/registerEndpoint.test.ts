import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
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
}));

// Mock Zod schemas
vi.mock("~/schema/zod", () => ({
  registerSchema: {
    parse: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

// Mock services
const mockHashService = {
  hash: vi.fn(),
};
vi.mock("~/server/services/HashService", () => ({
  default: vi.fn().mockImplementation(() => mockHashService),
}));

// Mock logger
vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/lib/rateLimitRedis", () => ({
  clientIpFromEvent: vi.fn(() => "127.0.0.1"),
  rateLimitByKey: vi.fn().mockResolvedValue({ allowed: true }),
}));

// Mock postmark client
vi.mock("~/server/clients/postmarkClient", () => ({
  postmarkClient: {
    sendEmail: vi.fn(),
  },
}));

// Mock error handler
vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

// Make readBody globally available
(globalThis as any).readBody = vi.fn();

/** Synthetic registration body field for tests only (not a real credential). */
const REGISTER_MOCK_PLAINTEXT = "Qx9k-mock-registration-input";

describe("Register API Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/register", () => {
    let registerHandler: any;

    beforeEach(async () => {
      const module = await import("../account-signup.post");
      registerHandler = module.default;
    });

    it("should successfully register a new user and send emails", async () => {
      const mockEvent = {};
      const mockBody = {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        password: REGISTER_MOCK_PLAINTEXT,
      };

      const mockUser = {
        id: 123,
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
      };

      const mockAccount = { id: "account-123" };
      const mockBudget = { id: "budget-123" };

      const { readBody, setResponseStatus } = await import("h3");
      const { registerSchema } = await import("~/schema/zod");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { postmarkClient } =
        await import("~/server/clients/postmarkClient");
      await import("~/server/logger");

      (readBody as any).mockResolvedValue(mockBody);
      (registerSchema.parse as any).mockReturnValue(mockBody);
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      mockHashService.hash.mockResolvedValue("hashedPassword123");

      const accountRegisterCreate = vi.fn().mockResolvedValue({});
      const mockPrismaTransaction = {
        user: {
          create: vi.fn().mockResolvedValue(mockUser),
        },
        account: {
          create: vi.fn().mockResolvedValue(mockAccount),
        },
        budget: {
          create: vi.fn().mockResolvedValue(mockBudget),
        },
        userAccount: {
          create: vi.fn().mockResolvedValue({}),
        },
        accountRegister: {
          create: accountRegisterCreate,
        },
        accountType: {
          findFirst: vi.fn().mockResolvedValue({ id: 22 }),
        },
      };

      // Mock transaction
      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        return await callback(mockPrismaTransaction);
      });

      (postmarkClient.sendEmail as any).mockResolvedValue({});

      const result = await registerHandler(mockEvent);

      // Verify the registration process
      expect(registerSchema.parse).toHaveBeenCalledWith(mockBody);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "john.doe@example.com" },
      });
      expect(mockHashService.hash).toHaveBeenCalledWith(
        REGISTER_MOCK_PLAINTEXT,
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockPrismaTransaction.accountType.findFirst).toHaveBeenCalledWith({
        where: { type: "cash" },
        select: { id: true },
      });
      expect(accountRegisterCreate).toHaveBeenCalledTimes(2);

      // Verify both emails are sent
      expect(postmarkClient.sendEmail).toHaveBeenCalledTimes(2);

      // Check welcome email to user
      expect(postmarkClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: "Mr. Pepe Dineros <pepe@dineros.cc>",
          To: "john.doe@example.com",
          Subject: "Welcome to Dineros!",
          HtmlBody: expect.stringContaining("John"),
        }),
      );

      // Check notification email to jeremy
      expect(postmarkClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: "Mr. Pepe Dineros <pepe@dineros.cc>",
          To: "admin@dineros.cc",
          Subject: "New User Registration on Dineros.cc",
          HtmlBody: expect.stringContaining("john.doe@example.com"),
        }),
      );

      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 201);
      expect(result).toEqual({ message: "User registered successfully." });
    });

    it("should return 409 if email is already in use", async () => {
      const mockEvent = {};
      const mockBody = {
        firstName: "John",
        lastName: "Doe",
        email: "existing@example.com",
        password: REGISTER_MOCK_PLAINTEXT,
      };

      const existingUser = {
        id: 456,
        email: "existing@example.com",
      };

      const { readBody, setResponseStatus } = await import("h3");
      const { registerSchema } = await import("~/schema/zod");
      const { prisma } = await import("~/server/clients/prismaClient");

      (readBody as any).mockResolvedValue(mockBody);
      (registerSchema.parse as any).mockReturnValue(mockBody);
      (prisma.user.findUnique as any).mockResolvedValue(existingUser);

      const result = await registerHandler(mockEvent);

      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 409);
      expect(result).toEqual({ message: "Email is already in use." });
    });

    it("should handle schema validation errors", async () => {
      const mockEvent = {};
      const mockBody = { email: "invalid-email" };

      const { readBody } = await import("h3");
      const { registerSchema } = await import("~/schema/zod");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      const validationError = new Error("Invalid email format");
      (registerSchema.parse as any).mockImplementation(() => {
        throw validationError;
      });

      await expect(registerHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(validationError);
    });

    it("should handle database transaction errors", async () => {
      const mockEvent = {};
      const mockBody = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        password: REGISTER_MOCK_PLAINTEXT,
      };

      const { readBody } = await import("h3");
      const { registerSchema } = await import("~/schema/zod");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      (registerSchema.parse as any).mockReturnValue(mockBody);
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      mockHashService.hash.mockResolvedValue("hashedPassword123");

      const dbError = new Error("Database transaction failed");
      (prisma.$transaction as any).mockRejectedValue(dbError);

      await expect(registerHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalledWith(dbError);
    });

    it("should handle email sending errors gracefully", async () => {
      const mockEvent = {};
      const mockBody = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        password: REGISTER_MOCK_PLAINTEXT,
      };

      const mockUser = { id: 123 };
      const mockAccount = { id: "account-123" };
      const mockBudget = { id: "budget-123" };

      const { readBody } = await import("h3");
      const { registerSchema } = await import("~/schema/zod");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { postmarkClient } =
        await import("~/server/clients/postmarkClient");

      (readBody as any).mockResolvedValue(mockBody);
      (registerSchema.parse as any).mockReturnValue(mockBody);
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      mockHashService.hash.mockResolvedValue("hashedPassword123");

      const accountRegisterCreate = vi.fn().mockResolvedValue({});
      const mockPrismaTransaction = {
        user: { create: vi.fn().mockResolvedValue(mockUser) },
        account: { create: vi.fn().mockResolvedValue(mockAccount) },
        budget: { create: vi.fn().mockResolvedValue(mockBudget) },
        userAccount: { create: vi.fn().mockResolvedValue({}) },
        accountRegister: { create: accountRegisterCreate },
        accountType: {
          findFirst: vi.fn().mockResolvedValue({ id: 22 }),
        },
      };

      // Mock successful transaction
      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        return await callback(mockPrismaTransaction);
      });

      // Mock email failure
      const emailError = new Error("Email service unavailable");
      (postmarkClient.sendEmail as any).mockRejectedValue(emailError);

      await expect(registerHandler(mockEvent)).rejects.toThrow();
    });

    it("should fail when cash account type is not configured", async () => {
      const mockEvent = {};
      const mockBody = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        password: REGISTER_MOCK_PLAINTEXT,
      };

      const mockUser = { id: 123 };
      const mockAccount = { id: "account-123" };
      const mockBudget = { id: "budget-123" };

      const { readBody } = await import("h3");
      const { registerSchema } = await import("~/schema/zod");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (readBody as any).mockResolvedValue(mockBody);
      (registerSchema.parse as any).mockReturnValue(mockBody);
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.country.findUnique as any).mockResolvedValue({ id: 840 });
      mockHashService.hash.mockResolvedValue("hashedPassword123");

      const mockPrismaTransaction = {
        user: { create: vi.fn().mockResolvedValue(mockUser) },
        account: { create: vi.fn().mockResolvedValue(mockAccount) },
        budget: { create: vi.fn().mockResolvedValue(mockBudget) },
        userAccount: { create: vi.fn().mockResolvedValue({}) },
        accountRegister: { create: vi.fn().mockResolvedValue({}) },
        accountType: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        return await callback(mockPrismaTransaction);
      });

      await expect(registerHandler(mockEvent)).rejects.toThrow();
      expect(handleApiError).toHaveBeenCalled();
    });
  });
});
