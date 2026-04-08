import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { dbUserForSession } from "./fixtures/dbUserForSession";

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

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/schema/zod", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/schema/zod")>();
  const mockPublicProfileParse = vi.fn();
  return {
    ...actual,
    publicProfileSchema: new Proxy(actual.publicProfileSchema, {
      get(target, prop, receiver) {
        if (prop === "parse") return mockPublicProfileParse;
        return Reflect.get(target, prop, receiver);
      },
    }),
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
    const mockUser = dbUserForSession();

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { sessionUserFromDb } = await import(
      "~/server/lib/sessionUserProfile"
    );

    getUser.mockReturnValue({ userId: 123 });
    prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

    const result = await userGetHandler(mockEvent);

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 123 },
    });
    expect(result).toEqual(sessionUserFromDb(mockUser));
  });

  it("should handle user not found", async () => {
    const mockEvent = {};

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { handleApiError } = await import("~/server/lib/handleApiError");

    getUser.mockReturnValue({ userId: 999 });
    prisma.user.findUniqueOrThrow.mockRejectedValue(
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
    const { password: _omit, ...row } = dbUserForSession();
    const mockUser = { ...row, firstName: "" } as Record<string, unknown>;

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { handleApiError } = await import("~/server/lib/handleApiError");

    getUser.mockReturnValue({ userId: 123 });
    prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

    handleApiError.mockImplementation((err: unknown) => {
      throw err;
    });

    await expect(userGetHandler(mockEvent)).rejects.toThrow();

    expect(getUser).toHaveBeenCalledWith(mockEvent);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 123 },
    });
    expect(handleApiError).toHaveBeenCalledWith(expect.any(z.ZodError));
  });

  it("should handle database errors", async () => {
    const mockEvent = {};

    const { getUser } = await import("~/server/lib/getUser");
    const { prisma } = await import("~/server/clients/prismaClient");
    const { handleApiError } = await import("~/server/lib/handleApiError");

    getUser.mockReturnValue({ userId: 123 });
    prisma.user.findUniqueOrThrow.mockRejectedValue(
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
