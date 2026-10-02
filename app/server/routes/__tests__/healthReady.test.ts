import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: unknown) => handler);
});

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
}));

vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import readiness from "../health/ready.get";
// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";

describe("GET /api/health/ready (route handler)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports ok when the database answers SELECT 1", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ "?column?": 1 }]);

    await expect(readiness({} as any)).resolves.toEqual({ ok: true });
  });

  it("throws a 500 Not Ready error when the database query fails", async () => {
    (prisma.$queryRaw as any).mockRejectedValue(new Error("pool exhausted"));

    await expect(readiness({} as any)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: "Not Ready",
    });
  });

  it("throws a 500 when the database does not answer within 2 seconds", async () => {
    vi.useFakeTimers();
    (prisma.$queryRaw as any).mockImplementation(
      () => new Promise(() => undefined),
    );

    const pending = readiness({} as any);
    const assertion = expect(pending).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: "Not Ready",
    });
    await vi.advanceTimersByTimeAsync(2_100);
    await assertion;
  });
});
