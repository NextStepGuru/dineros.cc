import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler: unknown) => handler);
});

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler: unknown) => handler),
  createError: vi.fn((error: any) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const err = new Error(`HTTP ${statusCode}: ${message}`) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  readBody: vi.fn(),
  getQuery: vi.fn(),
  setResponseStatus: vi.fn(),
  getRouterParam: vi.fn(),
  setHeader: vi.fn(),
  getHeader: vi.fn(),
}));

// Make H3 functions globally available
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();

// Mock server dependencies
vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/services/e2eSeedService", () => ({
  seedE2EUser: vi.fn(),
  deleteE2EUserByEmail: vi.fn(),
  E2E_USER_EMAIL: "e2e-test@dineros.cc",
}));

vi.mock("../e2e/_guard", () => ({
  assertE2EAllowed: vi.fn(),
}));

describe("E2E Seed API Endpoints", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations from earlier tests (e.g. guard
    // rejections), so reset the guard's default "allowed" behavior here.
    const { assertE2EAllowed } = await import("../e2e/_guard");
    (assertE2EAllowed as any).mockReset();
    (assertE2EAllowed as any).mockImplementation(() => undefined);
  });

  describe("POST /api/e2e/seed", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../e2e/seed.post");
      handler = module.default;
    });

    it("guards the request, seeds the E2E user and responds 201", async () => {
      const { assertE2EAllowed } = await import("../e2e/_guard");
      const { seedE2EUser } = await import("~/server/services/e2eSeedService");
      const { setResponseStatus } = await import("h3");

      const event = { node: { req: {} } };
      const seeded = {
        email: "e2e-test@dineros.cc",
        password: "plain-password",
        userId: 1,
        budgetId: 10,
        accountId: "account-1",
        checkingRegisterId: 100,
        savingsRegisterId: 200,
        categoryId: "category-1",
        reoccurrenceId: 300,
        savingsGoalId: 400,
      };
      (seedE2EUser as any).mockResolvedValue(seeded);

      const result = await handler(event);

      expect(assertE2EAllowed).toHaveBeenCalledTimes(1);
      expect(assertE2EAllowed).toHaveBeenCalledWith(event);
      expect(seedE2EUser).toHaveBeenCalledTimes(1);
      expect(setResponseStatus).toHaveBeenCalledWith(event, 201);
      expect(result).toBe(seeded);
    });

    it("maps Prisma request errors (including via cause chain) to a 500 createError", async () => {
      const { seedE2EUser } = await import("~/server/services/e2eSeedService");
      const { log } = await import("~/server/logger");

      (seedE2EUser as any).mockRejectedValue(
        new Error("seed failed", {
          cause: { code: "P2002", message: "Unique constraint failed" },
        }),
      );

      const error = await handler({}).catch((e: any) => e);

      expect(error.statusCode).toBe(500);
      expect(error.statusMessage).toBe(
        "P2002: Unique constraint failed",
      );
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "E2E seed failed",
          level: "error",
          data: { code: "P2002", message: "Unique constraint failed" },
        }),
      );
    });

    it("routes non-Prisma failures through handleApiError and rethrows", async () => {
      const { seedE2EUser } = await import("~/server/services/e2eSeedService");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const failure = new Error("hashing blew up");
      (seedE2EUser as any).mockRejectedValue(failure);

      await expect(handler({})).rejects.toThrow("hashing blew up");
      expect(handleApiError).toHaveBeenCalledWith(failure);
    });

    it("propagates guard rejections without seeding", async () => {
      const { assertE2EAllowed } = await import("../e2e/_guard");
      const { seedE2EUser } = await import("~/server/services/e2eSeedService");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const guardError = Object.assign(new Error("Not found"), {
        statusCode: 404,
      });
      (assertE2EAllowed as any).mockImplementation(() => {
        throw guardError;
      });

      const error = await handler({}).catch((e: any) => e);

      expect(error.statusCode).toBe(404);
      expect(seedE2EUser).not.toHaveBeenCalled();
      expect(handleApiError).toHaveBeenCalledWith(guardError);
    });
  });

  describe("POST /api/e2e/cleanup", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../e2e/cleanup.post");
      handler = module.default;
    });

    it("guards the request and deletes the E2E user by its stable email", async () => {
      const { assertE2EAllowed } = await import("../e2e/_guard");
      const { deleteE2EUserByEmail, E2E_USER_EMAIL } = await import(
        "~/server/services/e2eSeedService"
      );

      const event = { node: { req: {} } };
      (deleteE2EUserByEmail as any).mockResolvedValue({ deleted: true });

      const result = await handler(event);

      expect(assertE2EAllowed).toHaveBeenCalledTimes(1);
      expect(assertE2EAllowed).toHaveBeenCalledWith(event);
      expect(deleteE2EUserByEmail).toHaveBeenCalledTimes(1);
      expect(deleteE2EUserByEmail).toHaveBeenCalledWith(E2E_USER_EMAIL);
      expect(result).toEqual({ ok: true, deleted: true });
    });

    it("reports deleted false when the user was already gone", async () => {
      const { deleteE2EUserByEmail } = await import(
        "~/server/services/e2eSeedService"
      );

      (deleteE2EUserByEmail as any).mockResolvedValue({ deleted: false });

      const result = await handler({});

      expect(result).toEqual({ ok: true, deleted: false });
    });

    it("routes deletion failures through handleApiError and rethrows", async () => {
      const { deleteE2EUserByEmail } = await import(
        "~/server/services/e2eSeedService"
      );
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const failure = new Error("delete failed");
      (deleteE2EUserByEmail as any).mockRejectedValue(failure);

      await expect(handler({})).rejects.toThrow("delete failed");
      expect(handleApiError).toHaveBeenCalledWith(failure);
    });

    it("propagates guard rejections without deleting", async () => {
      const { assertE2EAllowed } = await import("../e2e/_guard");
      const { deleteE2EUserByEmail } = await import(
        "~/server/services/e2eSeedService"
      );
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const guardError = Object.assign(new Error("Forbidden"), {
        statusCode: 403,
      });
      (assertE2EAllowed as any).mockImplementation(() => {
        throw guardError;
      });

      const error = await handler({}).catch((e: any) => e);

      expect(error.statusCode).toBe(403);
      expect(deleteE2EUserByEmail).not.toHaveBeenCalled();
      expect(handleApiError).toHaveBeenCalledWith(guardError);
    });
  });
});
