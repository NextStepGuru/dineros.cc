import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

const fixedNow = new Date("2024-06-15T08:00:00.000Z");
vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    nowDate: vi.fn(() => fixedNow),
    toDate: vi.fn((d: unknown) => (d instanceof Date ? d : new Date(d as string))),
    subtract: vi.fn((_n: number, _unit: string, d: Date) =>
      new Date(d.getTime() - 90 * 24 * 60 * 60 * 1000),
    ),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";
// eslint-disable-next-line import/first -- mocks must be registered first
import { getReoccurrenceHealth } from "../reoccurrenceHealthService";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    description: "Rent",
    amount: 1500,
    intervalId: 3,
    intervalCount: 1,
    endAt: null,
    lastAt: new Date("2024-06-01T00:00:00.000Z"),
    accountRegisterId: 11,
    register: { name: "Checking" },
    ...overrides,
  };
}

describe("getReoccurrenceHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty issues and counts when the budget is inaccessible", async () => {
    (prisma.budget.findFirst as any).mockResolvedValue(null);

    const result = await getReoccurrenceHealth({ userId: 1, budgetId: 7 });

    expect(result).toEqual({
      issues: [],
      counts: {
        duplicate_rule: 0,
        ended_rule: 0,
        last_run_after_end: 0,
        stale_last_run: 0,
        zero_amount: 0,
      },
    });
    expect(prisma.reoccurrence.findMany).not.toHaveBeenCalled();
  });

  it("scopes the reoccurrence query to the user and budget", async () => {
    (prisma.budget.findFirst as any).mockResolvedValue({ id: 7 });
    (prisma.reoccurrence.findMany as any).mockResolvedValue([]);

    await getReoccurrenceHealth({ userId: 1, budgetId: 7 });

    expect(prisma.reoccurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          account: { userAccounts: { some: { userId: 1 } } },
          register: { budgetId: 7, isArchived: false },
        },
      }),
    );
  });

  it("flags duplicate rules sharing account, amount, interval, and description", async () => {
    (prisma.budget.findFirst as any).mockResolvedValue({ id: 7 });
    (prisma.reoccurrence.findMany as any).mockResolvedValue([
      row({ id: 1 }),
      row({ id: 2 }),
      row({ id: 3, description: "rent", amount: "1500" }),
      row({ id: 4, description: "Other bill" }),
    ]);

    const result = await getReoccurrenceHealth({ userId: 1, budgetId: 7 });

    const dupes = result.issues.filter(
      (i: any) => i.type === "duplicate_rule",
    );
    expect(dupes).toHaveLength(3);
    expect(dupes.map((i: any) => i.reoccurrenceId).sort()).toEqual([1, 2, 3]);
    // occurrenceKey embeds the row id; the group suffix (composite key + member ids) is shared.
    const groupSuffixes = new Set(
      dupes.map((i: any) => i.occurrenceKey.split(":").slice(2).join(":")),
    );
    expect(groupSuffixes.size).toBe(1);
    expect(result.counts.duplicate_rule).toBe(3);
  });

  it("flags zero-amount rules", async () => {
    (prisma.budget.findFirst as any).mockResolvedValue({ id: 7 });
    (prisma.reoccurrence.findMany as any).mockResolvedValue([
      row({ amount: 0 }),
    ]);

    const result = await getReoccurrenceHealth({ userId: 1, budgetId: 7 });

    expect(result.issues.map((i: any) => i.type)).toEqual(["zero_amount"]);
    expect(result.counts.zero_amount).toBe(1);
  });

  it("flags rules whose end date is already past", async () => {
    (prisma.budget.findFirst as any).mockResolvedValue({ id: 7 });
    (prisma.reoccurrence.findMany as any).mockResolvedValue([
      row({ endAt: new Date("2024-01-01T00:00:00.000Z") }),
    ]);

    const result = await getReoccurrenceHealth({ userId: 1, budgetId: 7 });

    expect(result.issues.map((i: any) => i.type)).toContain("ended_rule");
  });

  it("flags last runs recorded after the end date", async () => {
    (prisma.budget.findFirst as any).mockResolvedValue({ id: 7 });
    (prisma.reoccurrence.findMany as any).mockResolvedValue([
      row({
        endAt: new Date("2024-06-01T00:00:00.000Z"),
        lastAt: new Date("2024-06-10T00:00:00.000Z"),
      }),
    ]);

    const result = await getReoccurrenceHealth({ userId: 1, budgetId: 7 });

    expect(result.issues.map((i: any) => i.type)).toContain(
      "last_run_after_end",
    );
  });

  it("flags stale last runs only for open-ended rules", async () => {
    (prisma.budget.findFirst as any).mockResolvedValue({ id: 7 });
    (prisma.reoccurrence.findMany as any).mockResolvedValue([
      // last run ~200 days before now (cutoff is 90 days), no end date → stale
      row({ id: 10, lastAt: new Date("2023-12-01T00:00:00.000Z") }),
      // stale-looking lastAt but has an end date → not flagged stale
      row({
        id: 11,
        lastAt: new Date("2023-12-01T00:00:00.000Z"),
        endAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
    ]);

    const result = await getReoccurrenceHealth({ userId: 1, budgetId: 7 });

    const stale = result.issues.filter((i: any) => i.type === "stale_last_run");
    expect(stale.map((i: any) => i.reoccurrenceId)).toEqual([10]);
    expect(result.counts.stale_last_run).toBe(1);
  });

  it("reports no issues for a healthy rule and aggregates counts", async () => {
    (prisma.budget.findFirst as any).mockResolvedValue({ id: 7 });
    (prisma.reoccurrence.findMany as any).mockResolvedValue([
      row({ id: 20 }),
    ]);

    const result = await getReoccurrenceHealth({ userId: 1, budgetId: 7 });

    expect(result.issues).toEqual([]);
    expect(result.counts).toEqual({
      duplicate_rule: 0,
      ended_rule: 0,
      last_run_after_end: 0,
      stale_last_run: 0,
      zero_amount: 0,
    });
  });
});
