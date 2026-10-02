import { beforeEach, describe, expect, it, vi } from "vitest";

import * as statementMatchService from "../statementMatchService";

// The service imports clients that must not reach the network or DB.
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/env", () => ({
  default: {
    OPENAI_API_KEY: "test-key",
    OPENAI_PLAID_MATCH_MIN_CONFIDENCE: 0.7,
  },
}));

vi.mock("~/server/clients/openaiClient", () => ({
  getOpenAIClient: vi.fn(),
}));

vi.mock("~/server/services/OpenAiCompletionLogger", () => ({
  loggedChatCompletion: vi.fn(),
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    format: vi.fn((fmt: string, input: unknown) => {
      const d = input instanceof Date ? input : new Date(String(input));
      const iso = d.toISOString();
      if (fmt === "YYYY") return iso.slice(0, 4);
      return iso.slice(0, 10);
    }),
    diff: vi.fn((a: Date, b: Date) =>
      Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000),
    ),
    parseInput: vi.fn((input: string) => ({
      toDate: () => new Date(`${input}T00:00:00.000Z`),
    })),
    toDate: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
    now: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
    utcCalendarDate: vi.fn((y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m, d)),
    ),
  },
}));

let prisma: any;
let loggedChatCompletion: any;
let getOpenAIClient: any;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ prisma } = await import("~/server/clients/prismaClient"));
  ({ loggedChatCompletion } = await import(
    "~/server/services/OpenAiCompletionLogger",
  ));
  ({ getOpenAIClient } = await import("~/server/clients/openaiClient"));
  getOpenAIClient.mockReturnValue({});
});

function lineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7001,
    reconciliationPeriodId: 501,
    postedAt: new Date("2024-06-05T00:00:00.000Z"),
    description: "STARBUCKS STORE",
    amount: -5,
    lineType: null,
    matchStatus: "unmatched",
    registerEntryId: null,
    matchConfidence: null,
    matchReason: null,
    ignoredAt: null,
    sortIndex: 0,
    ...overrides,
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  const entry: Record<string, unknown> = {
    id: "e1",
    createdAt: new Date("2024-06-05T10:00:00.000Z"),
    description: "STARBUCKS",
    amount: -5,
    isReconciled: false,
    isProjected: false,
    isPending: false,
    reoccurrenceId: null,
    sourceAccountRegisterId: null,
    plaidJson: null,
    ...((overrides as any).registerEntry ?? {}),
  };
  const row: Record<string, unknown> = {
    id: 9001,
    reconciliationPeriodId: 501,
    registerEntryId: "e1",
    isCleared: false,
    clearedAt: null,
    note: null,
    ...overrides,
  };
  row.registerEntry = entry;
  delete row.registerEntryOverrides;
  return row;
}

describe("statementMatchService", () => {
  describe("matchStatementLinesForPeriod", () => {
    it("loads the period's lines and items from prisma", async () => {
      prisma.statementLine.findMany.mockResolvedValue([]);
      prisma.reconciliationItem.findMany.mockResolvedValue([]);

      await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(prisma.statementLine.findMany).toHaveBeenCalledWith({
        where: { reconciliationPeriodId: 501 },
        orderBy: [{ sortIndex: "asc" }, { id: "asc" }],
      });
      expect(prisma.reconciliationItem.findMany).toHaveBeenCalledWith({
        where: { reconciliationPeriodId: 501 },
        include: {
          registerEntry: {
            select: {
              id: true,
              createdAt: true,
              description: true,
              amount: true,
              isReconciled: true,
              isProjected: true,
              isPending: true,
              reoccurrenceId: true,
              sourceAccountRegisterId: true,
              plaidJson: true,
            },
          },
        },
      });
    });

    it("pairs a line and entry with the exact amount on the same day", async () => {
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({ id: 1, amount: -5, postedAt: new Date("2024-06-05T00:00:00.000Z") }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e1",
          registerEntry: {
            createdAt: new Date("2024-06-05T10:00:00.000Z"),
            amount: -5,
          },
        }),
      ]);

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 1, conflicts: 0, statementOnly: 0 });
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          registerEntryId: "e1",
          matchStatus: "matched",
          matchConfidence: 1,
          matchReason: "Exact amount and posted date",
          ignoredAt: null,
        },
      });
      expect(prisma.reconciliationItem.update).toHaveBeenCalledWith({
        where: { id: 9001 },
        data: { isCleared: true, clearedAt: expect.any(Date) },
      });
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "e1" },
        data: { isCleared: true, isPending: true },
      });
      expect(loggedChatCompletion).not.toHaveBeenCalled();
    });

    it("prefers the merchant-overlapping entry and uses 0.9 confidence within 3 days", async () => {
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          id: 2,
          postedAt: new Date("2024-06-08T00:00:00.000Z"),
          amount: -5,
          description: "STARBUCKS 1234",
        }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          id: 9002,
          registerEntryId: "e-other",
          registerEntry: {
            id: "e-other",
            description: "SHELL OIL",
            createdAt: new Date("2024-06-07T09:00:00.000Z"),
            amount: -5,
          },
        }),
        itemRow({
          registerEntryId: "e-starbucks",
          registerEntry: {
            id: "e-starbucks",
            description: "STARBUCKS",
            createdAt: new Date("2024-06-05T09:00:00.000Z"),
            amount: -5,
          },
        }),
      ]);

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 1, conflicts: 0, statementOnly: 0 });
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: expect.objectContaining({
          registerEntryId: "e-starbucks",
          matchStatus: "matched",
          matchConfidence: 0.9,
          matchReason: "Same amount within 3 days",
        }),
      });
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "e-starbucks" },
        data: { isCleared: true, isPending: true },
      });
      expect(prisma.registerEntry.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "e-other" } }),
      );
    });

    it("falls back to a single amount candidate without merchant overlap at 0.85 confidence", async () => {
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          id: 3,
          postedAt: new Date("2024-06-08T00:00:00.000Z"),
          amount: -6.5,
          description: "MYSTERY CHARGE",
        }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e1",
          registerEntry: {
            description: "SOMETHING ELSE",
            createdAt: new Date("2024-06-06T09:00:00.000Z"),
            amount: -6.5,
          },
        }),
      ]);

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 1, conflicts: 0, statementOnly: 0 });
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: expect.objectContaining({
          registerEntryId: "e1",
          matchStatus: "matched",
          matchConfidence: 0.85,
          matchReason: "Same amount within 3 days",
        }),
      });
    });

    it("flags a same-merchant near-date line with a different amount as a conflict", async () => {
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          id: 4,
          postedAt: new Date("2024-06-06T00:00:00.000Z"),
          amount: -9,
          description: "STARBUCKS STORE",
        }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e4",
          registerEntry: {
            id: "e4",
            description: "STARBUCKS",
            createdAt: new Date("2024-06-06T09:00:00.000Z"),
            amount: -5,
          },
        }),
      ]);

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 0, conflicts: 1, statementOnly: 0 });
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: expect.objectContaining({
          registerEntryId: "e4",
          matchStatus: "conflict",
          matchConfidence: 0.6,
          matchReason:
            "Same merchant near the posted date but amount differs",
        }),
      });
      expect(prisma.reconciliationItem.update).not.toHaveBeenCalled();
    });

    it("keeps pre-matched lines, skips ignored lines, and marks leftovers statement_only", async () => {
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          id: 10,
          matchStatus: "matched",
          registerEntryId: "e9",
        }),
        lineRow({
          id: 11,
          matchStatus: "ignored",
          ignoredAt: new Date("2024-06-10T00:00:00.000Z"),
          description: "CHECK FEE",
          amount: -3,
        }),
        lineRow({
          id: 12,
          description: "UNMATCHED CHARGE",
          amount: -4,
        }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e9",
          registerEntry: {
            id: "e9",
            description: "Already matched entry",
            createdAt: new Date("2024-06-05T09:00:00.000Z"),
            amount: -5,
          },
        }),
      ]);

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 1, conflicts: 0, statementOnly: 1 });
      expect(prisma.statementLine.update).toHaveBeenCalledTimes(1);
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: {
          registerEntryId: null,
          matchStatus: "statement_only",
          matchConfidence: null,
          matchReason: "No ledger match",
        },
      });
      expect(prisma.reconciliationItem.update).not.toHaveBeenCalled();
      expect(loggedChatCompletion).not.toHaveBeenCalled();
    });

    it("applies a high-confidence LLM match for leftovers outside the heuristics", async () => {
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          id: 20,
          postedAt: new Date("2024-06-05T00:00:00.000Z"),
          amount: -7.77,
          description: "WEIRD MERCHANT X",
        }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e20",
          registerEntry: {
            id: "e20",
            description: "WEIRD MERCHANT X",
            createdAt: new Date("2024-06-20T09:00:00.000Z"),
            amount: -7.77,
          },
        }),
      ]);
      loggedChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                matches: [
                  {
                    statementLineId: 20,
                    entryId: "e20",
                    confidence: 0.95,
                    reason: "Same signed amount, date far off",
                  },
                ],
              }),
            },
          },
        ],
      });

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 1, conflicts: 0, statementOnly: 0 });
      expect(loggedChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: "statement_line_match",
          metadata: expect.objectContaining({
            userId: 1,
            accountId: "acct-1",
            periodId: 501,
          }),
        }),
      );
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: expect.objectContaining({
          registerEntryId: "e20",
          matchStatus: "matched",
          matchConfidence: 0.95,
        }),
      });
      expect(prisma.reconciliationItem.update).toHaveBeenCalledWith({
        where: { id: 9001 },
        data: { isCleared: true, clearedAt: expect.any(Date) },
      });
    });

    it("records a conflict when the LLM confidence is below the minimum", async () => {
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          id: 21,
          postedAt: new Date("2024-06-05T00:00:00.000Z"),
          amount: -7.77,
          description: "WEIRD MERCHANT X",
        }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e21",
          registerEntry: {
            id: "e21",
            description: "WEIRD MERCHANT X",
            createdAt: new Date("2024-06-20T09:00:00.000Z"),
            amount: -7.77,
          },
        }),
      ]);
      loggedChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                matches: [
                  {
                    statementLineId: 21,
                    entryId: "e21",
                    confidence: 0.5,
                    reason: "Not sure",
                  },
                ],
              }),
            },
          },
        ],
      });

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 0, conflicts: 1, statementOnly: 0 });
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 21 },
        data: expect.objectContaining({
          registerEntryId: "e21",
          matchStatus: "conflict",
          matchConfidence: 0.5,
          matchReason: "Not sure",
        }),
      });
      expect(prisma.reconciliationItem.update).not.toHaveBeenCalled();
    });

    it("ignores LLM rows for unknown lines or unknown entries and marks the line statement_only", async () => {
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          id: 22,
          postedAt: new Date("2024-06-05T00:00:00.000Z"),
          amount: -7.77,
          description: "WEIRD MERCHANT X",
        }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e22",
          registerEntry: {
            id: "e22",
            description: "WEIRD MERCHANT X",
            createdAt: new Date("2024-06-20T09:00:00.000Z"),
            amount: -7.77,
          },
        }),
      ]);
      loggedChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                matches: [
                  {
                    statementLineId: 999,
                    entryId: "e22",
                    confidence: 0.99,
                    reason: "unknown line",
                  },
                  {
                    statementLineId: 22,
                    entryId: "ghost-entry",
                    confidence: 0.99,
                    reason: "unknown entry",
                  },
                ],
              }),
            },
          },
        ],
      });

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 0, conflicts: 0, statementOnly: 1 });
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 22 },
        data: expect.objectContaining({ matchStatus: "statement_only" }),
      });
    });

    it("marks leftovers statement_only without calling the LLM when no client is available", async () => {
      getOpenAIClient.mockReturnValue(null);
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          id: 23,
          postedAt: new Date("2024-06-05T00:00:00.000Z"),
          amount: -7.77,
          description: "WEIRD MERCHANT X",
        }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e23",
          registerEntry: {
            id: "e23",
            description: "WEIRD MERCHANT X",
            createdAt: new Date("2024-06-20T09:00:00.000Z"),
            amount: -7.77,
          },
        }),
      ]);

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 0, conflicts: 0, statementOnly: 1 });
      expect(loggedChatCompletion).not.toHaveBeenCalled();
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 23 },
        data: expect.objectContaining({ matchStatus: "statement_only" }),
      });
    });

    it("falls back to statement_only when the LLM response is not valid JSON", async () => {
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          id: 24,
          postedAt: new Date("2024-06-05T00:00:00.000Z"),
          amount: -7.77,
          description: "WEIRD MERCHANT X",
        }),
      ]);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e24",
          registerEntry: {
            id: "e24",
            description: "WEIRD MERCHANT X",
            createdAt: new Date("2024-06-20T09:00:00.000Z"),
            amount: -7.77,
          },
        }),
      ]);
      loggedChatCompletion.mockResolvedValue({
        choices: [{ message: { content: "not-json" } }],
      });

      const result = await statementMatchService.matchStatementLinesForPeriod({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });

      expect(result).toEqual({ matched: 0, conflicts: 0, statementOnly: 1 });
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 24 },
        data: expect.objectContaining({ matchStatus: "statement_only" }),
      });
    });
  });

  describe("loadTransferRecurrenceIds", () => {
    it("returns an empty set without querying when the list is empty", async () => {
      const result = await statementMatchService.loadTransferRecurrenceIds([]);

      expect(result).toEqual(new Set());
      expect(prisma.reoccurrence.findMany).not.toHaveBeenCalled();
    });

    it("returns only recurrences that have a transfer account register", async () => {
      prisma.reoccurrence.findMany.mockResolvedValue([
        { id: 1, transferAccountRegisterId: 5 },
        { id: 2, transferAccountRegisterId: null },
        { id: 3, transferAccountRegisterId: 9 },
      ]);

      const result = await statementMatchService.loadTransferRecurrenceIds([
        1, 2, 3,
      ]);

      expect(prisma.reoccurrence.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2, 3] } },
        select: { id: true, transferAccountRegisterId: true },
      });
      expect(result).toEqual(new Set([1, 3]));
    });
  });

  describe("ledgerOnlyHint", () => {
    const endDate = new Date("2024-06-30T23:59:59.999Z");
    const noTransfers = new Set<number>();

    function hintItem(registerEntryOverrides: Record<string, unknown> = {}) {
      return itemRow({
        registerEntry: registerEntryOverrides,
      }) as unknown as Parameters<
        typeof statementMatchService.ledgerOnlyHint
      >[0]["item"];
    }

    it("hints projected entries first", () => {
      const hint = statementMatchService.ledgerOnlyHint({
        item: hintItem({ isProjected: true, isPending: true }),
        endDate,
        transferRecurrenceIds: noTransfers,
      });
      expect(hint).toBe("projected");
    });

    it("hints transfers by recurrence id", () => {
      const hint = statementMatchService.ledgerOnlyHint({
        item: hintItem({ reoccurrenceId: 7 }),
        endDate,
        transferRecurrenceIds: new Set([7]),
      });
      expect(hint).toBe("transfer");
    });

    it("hints transfers by source account register", () => {
      const hint = statementMatchService.ledgerOnlyHint({
        item: hintItem({ sourceAccountRegisterId: 3 }),
        endDate,
        transferRecurrenceIds: noTransfers,
      });
      expect(hint).toBe("transfer");
    });

    it("hints transfers by description keywords", () => {
      const hint = statementMatchService.ledgerOnlyHint({
        item: hintItem({ description: "Online Transfer to Savings" }),
        endDate,
        transferRecurrenceIds: noTransfers,
      });
      expect(hint).toBe("transfer");
    });

    it("hints next_statement for plaid pending entries", () => {
      const hint = statementMatchService.ledgerOnlyHint({
        item: hintItem({ plaidJson: { pending: true } }),
        endDate,
        transferRecurrenceIds: noTransfers,
      });
      expect(hint).toBe("next_statement");
    });

    it("hints next_statement when the plaid posted date falls after the period end", () => {
      const hint = statementMatchService.ledgerOnlyHint({
        item: hintItem({ plaidJson: { date: "2024-07-02" } }),
        endDate,
        transferRecurrenceIds: noTransfers,
      });
      expect(hint).toBe("next_statement");
    });

    it("does not hint next_statement when the plaid posted date is inside the period", () => {
      const hint = statementMatchService.ledgerOnlyHint({
        item: hintItem({ plaidJson: { date: "2024-06-30" } }),
        endDate,
        transferRecurrenceIds: noTransfers,
      });
      expect(hint).toBe("missing_from_statement");
    });

    it("hints pending for uncleared pending entries", () => {
      const hint = statementMatchService.ledgerOnlyHint({
        item: hintItem({ isPending: true }),
        endDate,
        transferRecurrenceIds: noTransfers,
      });
      expect(hint).toBe("pending");
    });

    it("hints pending for uncleared pending entries even when the item is cleared", () => {
      const item = itemRow({
        isCleared: true,
        registerEntry: { isPending: true },
      }) as unknown as Parameters<
        typeof statementMatchService.ledgerOnlyHint
      >[0]["item"];
      const hint = statementMatchService.ledgerOnlyHint({
        item,
        endDate,
        transferRecurrenceIds: noTransfers,
      });
      expect(hint).toBe("missing_from_statement");
    });

    it("defaults to missing_from_statement", () => {
      const hint = statementMatchService.ledgerOnlyHint({
        item: hintItem(),
        endDate,
        transferRecurrenceIds: noTransfers,
      });
      expect(hint).toBe("missing_from_statement");
    });
  });
});
