import { describe, it, expect, beforeEach, vi } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
  // Make createError available globally before any imports
  (globalThis as any).createError = vi.fn((error) => {
    const err = new Error(
      error.statusMessage || error.message || "Unknown error"
    );
    (err as any).statusCode = error.statusCode || 500;
    throw err;
  });
});

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error) => {
    const err = new Error(
      error.statusMessage || error.message || "Unknown error"
    );
    (err as any).statusCode = error.statusCode || 500;
    throw err;
  }),
}));

// Mock dependencies
vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("~/schema/zod", () => ({
  privateUserSchema: {
    parse: vi.fn(),
  },
  publicProfileSchema: {
    parse: vi.fn(),
  },
}));

describe("Disable Two-Factor Auth POST API Endpoint", () => {
  let disableTwoFactorAuthHandler: any;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Import the handler dynamically to ensure mocks are applied
    const module = await import("../disable-two-factor-auth.post");
    disableTwoFactorAuthHandler = module.default;
  });

  it("should successfully disable two-factor authentication", async () => {
    const mockEvent = {};
    const mockUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      settings: {
        speakeasy: { isEnabled: true, isVerified: true },
        otherSetting: "value",
      },
    };
    const mockParsedUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      settings: {
        speakeasy: { isEnabled: true, isVerified: true },
        otherSetting: "value",
      },
    };
    const mockUpdatedUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      settings: {
        speakeasy: { isEnabled: false, isVerified: false },
        otherSetting: "value",
      },
    };
    const mockParsedResponse = {
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

    // Set up mocks properly
    (getUser as any).mockReturnValue({ userId: 123 });
    (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
    (privateUserSchema.parse as any).mockReturnValue(mockParsedUser);
    (prisma.user.update as any).mockResolvedValue(mockUpdatedUser);
    (publicProfileSchema.parse as any).mockReturnValue(mockParsedResponse);

    const result = await disableTwoFactorAuthHandler(mockEvent);

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 123 },
    });
    expect(privateUserSchema.parse).toHaveBeenCalledWith(mockUser);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 123 },
      data: {
        settings: {
          speakeasy: { isEnabled: false, isVerified: false },
          otherSetting: "value",
        },
      },
    });
    expect(publicProfileSchema.parse).toHaveBeenCalledWith(mockUpdatedUser);
    expect(result).toEqual(mockParsedResponse);
  });

  it("should handle user not found", async () => {
    const mockEvent = {};

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { handleApiError } = await import("~/server/lib/handleApiError");

    (getUser as any).mockReturnValue({ userId: 999 });
    (prisma.user.findUniqueOrThrow as any).mockRejectedValue(
      new Error("User not found")
    );

    await expect(disableTwoFactorAuthHandler(mockEvent)).rejects.toThrow(
      "User not found"
    );

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 999 },
    });
    expect(handleApiError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should handle schema validation errors", async () => {
    const mockEvent = {};
    const mockUser = {
      id: 123,
      email: "invalid-email",
      firstName: "Test",
      lastName: "User",
    };

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { privateUserSchema } = await import("~/schema/zod");
    const { handleApiError } = await import("~/server/lib/handleApiError");

    (getUser as any).mockReturnValue({ userId: 123 });
    (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
    (privateUserSchema.parse as any).mockImplementation(() => {
      throw new Error("Invalid user data");
    });

    await expect(disableTwoFactorAuthHandler(mockEvent)).rejects.toThrow(
      "Invalid user data"
    );

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 123 },
    });
    expect(privateUserSchema.parse).toHaveBeenCalledWith(mockUser);
    expect(handleApiError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should handle database update errors", async () => {
    const mockEvent = {};
    const mockUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      settings: {
        speakeasy: { isEnabled: true, isVerified: true },
      },
    };
    const mockParsedUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      settings: {
        speakeasy: { isEnabled: true, isVerified: true },
      },
    };

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { privateUserSchema } = await import("~/schema/zod");
    const { handleApiError } = await import("~/server/lib/handleApiError");

    (getUser as any).mockReturnValue({ userId: 123 });
    (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
    (privateUserSchema.parse as any).mockReturnValue(mockParsedUser);
    (prisma.user.update as any).mockRejectedValue(
      new Error("Database update failed")
    );

    await expect(disableTwoFactorAuthHandler(mockEvent)).rejects.toThrow(
      "Database update failed"
    );

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 123 },
    });
    expect(privateUserSchema.parse).toHaveBeenCalledWith(mockUser);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 123 },
      data: {
        settings: {
          speakeasy: { isEnabled: false, isVerified: false },
        },
      },
    });
    expect(handleApiError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should handle response schema validation errors", async () => {
    const mockEvent = {};
    const mockUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      settings: {
        speakeasy: { isEnabled: true, isVerified: true },
      },
    };
    const mockParsedUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      settings: {
        speakeasy: { isEnabled: true, isVerified: true },
      },
    };
    const mockUpdatedUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      settings: {
        speakeasy: { isEnabled: false, isVerified: false },
      },
    };

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { privateUserSchema, publicProfileSchema } = await import(
      "~/schema/zod"
    );
    const { handleApiError } = await import("~/server/lib/handleApiError");

    (getUser as any).mockReturnValue({ userId: 123 });
    (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
    (privateUserSchema.parse as any).mockReturnValue(mockParsedUser);
    (prisma.user.update as any).mockResolvedValue(mockUpdatedUser);
    (publicProfileSchema.parse as any).mockImplementation(() => {
      throw new Error("Invalid response data");
    });

    await expect(disableTwoFactorAuthHandler(mockEvent)).rejects.toThrow(
      "Invalid response data"
    );

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 123 },
    });
    expect(privateUserSchema.parse).toHaveBeenCalledWith(mockUser);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 123 },
      data: {
        settings: {
          speakeasy: { isEnabled: false, isVerified: false },
        },
      },
    });
    expect(publicProfileSchema.parse).toHaveBeenCalledWith(mockUpdatedUser);
    expect(handleApiError).toHaveBeenCalledWith(expect.any(Error));
  });
});
