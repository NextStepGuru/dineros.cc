import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  getQuery: vi.fn(),
}));

const mockEngine = { recalculate: vi.fn() };

vi.mock("~/server/services/forecast", () => ({
  ForecastEngineFactory: {
    create: vi.fn(() => mockEngine),
  },
  dateTimeService: {
    withRunContext: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) =>
      fn(),
    ),
    parseInput: vi.fn((s: string) => s),
    toDate: vi.fn((d: unknown) =>
      d instanceof Date ? d : new Date(String(d)),
    ),
    now: vi.fn(() => ({
      startOf: vi.fn(() => ({
        toDate: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
      })),
      add: vi.fn(() => ({
        toDate: vi.fn(() => new Date("2030-01-01T00:00:00.000Z")),
      })),
    })),
  },
}));

const prismaMock = vi.hoisted(() => ({
  accountRegister: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("~/server/clients/prismaClient", () => ({
  prisma: prismaMock,
}));

describe("GET /api/tasks/recalculate", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { getQuery } = await import("h3");
    (getQuery as any).mockReset();
    (getQuery as any).mockReturnValue({});
    (globalThis as any).getQuery = getQuery;
    const mod = await import("../tasks/recalculate");
    handler = mod.default;
  });

  it("returns early when single accountId not found", async () => {
    const { getQuery } = await import("h3");
    (getQuery as any).mockReturnValue({ accountId: "missing-id" });
    prismaMock.accountRegister.findFirst.mockResolvedValue(null);

    const out = await handler({});

    expect(out).toMatchObject({
      success: false,
      message: expect.stringContaining("not found"),
    });
  });

  it("processes single account when register exists", async () => {
    const { getQuery } = await import("h3");
    (getQuery as any).mockReturnValue({ accountId: "acc-1" });
    prismaMock.accountRegister.findFirst.mockResolvedValue({ id: 1 });
    mockEngine.recalculate.mockResolvedValue({
      isSuccess: true,
      registerEntries: [
        { isProjected: true },
        { isProjected: false, isBalanceEntry: false },
        { isBalanceEntry: true },
      ],
      accountRegisters: [{ id: 1 }],
      errors: null,
    });

    const out = await handler({});

    expect((out as { success: boolean }).success).toBe(true);
    expect(mockEngine.recalculate).toHaveBeenCalled();
  });

  it("returns message when no accounts in DB", async () => {
    const { getQuery } = await import("h3");
    (getQuery as any).mockReturnValue({});
    prismaMock.accountRegister.findMany.mockResolvedValue([]);

    const out = await handler({});

    expect(out).toMatchObject({
      success: false,
      message: expect.stringContaining("No accounts"),
    });
  });
});
