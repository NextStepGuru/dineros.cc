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
    },
  },
}));

vi.mock("~/schema/zod", () => {
  const parse = vi.fn();
  return {
    publicProfileSchema: {
      parse,
      extend: vi.fn(() => ({ parse })),
    },
  };
});

describe("User GET API Endpoint", () => {
  let userGetHandler: any;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Import the handler dynamically to ensure mocks are applied
    const module = await import("../user.get");
    userGetHandler = module.default;
  });

  it("should successfully return user profile data", async () => {
    const mockEvent = {};
    const mockUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    };
    const mockParsedUser = {
      id: 123,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
    };

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { publicProfileSchema } = await import("~/schema/zod");

    // Set up mocks properly
    (getUser as any).mockReturnValue({ userId: 123 });
    (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
    (publicProfileSchema.parse as any).mockReturnValue(mockParsedUser);

    const result = await userGetHandler(mockEvent);

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 123 },
    });
    expect(publicProfileSchema.parse).toHaveBeenCalledWith(mockUser);
    expect(result).toEqual(mockParsedUser);
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

    await expect(userGetHandler(mockEvent)).rejects.toThrow("User not found");

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
    const { publicProfileSchema } = await import("~/schema/zod");
    const { handleApiError } = await import("~/server/lib/handleApiError");

    (getUser as any).mockReturnValue({ userId: 123 });
    (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
    (publicProfileSchema.parse as any).mockImplementation(() => {
      throw new Error("Invalid email format");
    });

    await expect(userGetHandler(mockEvent)).rejects.toThrow(
      "Invalid email format"
    );

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 123 },
    });
    expect(publicProfileSchema.parse).toHaveBeenCalledWith(mockUser);
    expect(handleApiError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should handle database errors", async () => {
    const mockEvent = {};

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { handleApiError } = await import("~/server/lib/handleApiError");

    (getUser as any).mockReturnValue({ userId: 123 });
    (prisma.user.findUniqueOrThrow as any).mockRejectedValue(
      new Error("Database connection failed")
    );

    await expect(userGetHandler(mockEvent)).rejects.toThrow(
      "Database connection failed"
    );

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 123 },
    });
    expect(handleApiError).toHaveBeenCalledWith(expect.any(Error));
  });
});
