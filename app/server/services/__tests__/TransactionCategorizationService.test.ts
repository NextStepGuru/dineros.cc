import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "plaid";
import TransactionCategorizationService, {
  transactionFromPlaidJson,
} from "../TransactionCategorizationService";

const mockEnv = vi.hoisted(() => ({
  OPENAI_API_KEY: "test-key",
  OPENAI_PLAID_TX_MODEL: "test-categorize-model",
}));

vi.mock("~/server/env", () => ({ default: mockEnv }));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/clients/openaiClient", () => ({
  getOpenAIClient: vi.fn(),
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
  logRequest: vi.fn(),
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    now: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
  },
}));

vi.mock("~/server/services/integrationOpsAlert", () => ({
  isOpenAiCredentialFailure: vi.fn(() => false),
  notifyIntegrationAlert: vi.fn(),
}));

const ACCOUNT_ID = "acct-1";
const REGISTER_ID = 7;

const categories = [
  {
    id: "cat-food",
    name: "Food & Dining",
    subCategoryId: null,
    isArchived: false,
    accountId: ACCOUNT_ID,
  },
  {
    id: "cat-groceries",
    name: "Groceries",
    subCategoryId: "cat-food",
    isArchived: false,
    accountId: ACCOUNT_ID,
  },
  {
    id: "cat-transport",
    name: "Transportation",
    subCategoryId: null,
    isArchived: false,
    accountId: ACCOUNT_ID,
  },
  {
    id: "cat-fuel",
    name: "Fuel",
    subCategoryId: "cat-transport",
    isArchived: false,
    accountId: ACCOUNT_ID,
  },
];

function makeTx(overrides: Record<string, unknown> = {}): Transaction {
  return {
    transaction_id: "txn-1",
    amount: 42.5,
    date: "2024-01-05",
    name: "WHOLE FOODS MARKET",
    merchant_name: "WHOLE FOODS MARKET",
    ...overrides,
  } as unknown as Transaction;
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    categoryId: null,
    accountRegisterId: REGISTER_ID,
    plaidJson: makeTx() as unknown as Record<string, unknown>,
    ...overrides,
  };
}

function completionWithContent(content: string) {
  return {
    id: "resp-1",
    model: mockEnv.OPENAI_PLAID_TX_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  };
}

function llmItemsFromUserMessage(userContent: string): any[] {
  const payload = userContent.split("\n\nReturn JSON")[0] ?? "";
  const start = payload.indexOf("[");
  return JSON.parse(payload.slice(start));
}

describe("TransactionCategorizationService", () => {
  let prisma: any;
  let getOpenAIClient: any;
  let fakeClient: { chat: { completions: { create: any } } };
  let service: TransactionCategorizationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ prisma } = await import("~/server/clients/prismaClient"));
    ({ getOpenAIClient } = await import("~/server/clients/openaiClient"));

    fakeClient = { chat: { completions: { create: vi.fn() } } };
    getOpenAIClient.mockReturnValue(fakeClient);

    prisma.category.findMany.mockResolvedValue(categories);
    prisma.merchantCategoryRule.findMany.mockResolvedValue([]);
    prisma.registerEntry.count.mockResolvedValue(0);
    prisma.registerEntry.findMany.mockResolvedValue([]);
    prisma.registerEntry.update.mockResolvedValue({});
    prisma.openAiRequestLog.create.mockResolvedValue({});

    service = new TransactionCategorizationService();
  });

  describe("transactionFromPlaidJson", () => {
    it("returns the record cast as a Transaction for realistic Plaid JSON", () => {
      const json = {
        transaction_id: "plaid-txn-123",
        amount: -12.34,
        date: "2024-01-05",
        name: "SQ *BLUE BOTTLE COFFEE",
        merchant_name: "Blue Bottle Coffee",
        pending: false,
        personal_finance_category: {
          detailed: "FOOD_AND_DRINK_COFFEE",
          confidence_level: "HIGH",
        },
      };

      const result = transactionFromPlaidJson(json);

      expect(result).toBe(json);
      expect(result?.transaction_id).toBe("plaid-txn-123");
      expect(result?.amount).toBe(-12.34);
    });

    it("returns null for non-object input", () => {
      expect(transactionFromPlaidJson(null)).toBeNull();
      expect(transactionFromPlaidJson(undefined)).toBeNull();
      expect(transactionFromPlaidJson("txn")).toBeNull();
      expect(transactionFromPlaidJson(42)).toBeNull();
      expect(transactionFromPlaidJson([1, 2, 3])).toBeNull();
      expect(transactionFromPlaidJson(true)).toBeNull();
    });

    it("returns null when neither a numeric amount nor a string transaction_id exists", () => {
      expect(transactionFromPlaidJson({})).toBeNull();
      expect(transactionFromPlaidJson({ amount: "12.00" })).toBeNull();
      expect(transactionFromPlaidJson({ transaction_id: 7 })).toBeNull();
      expect(transactionFromPlaidJson({ name: "Mystery" })).toBeNull();
    });

    it("accepts amount-only and transaction_id-only records", () => {
      const amountOnly = transactionFromPlaidJson({ amount: 5 });
      expect(amountOnly).toEqual({ amount: 5 });

      const idOnly = transactionFromPlaidJson({ transaction_id: "abc" });
      expect(idOnly).toEqual({ transaction_id: "abc" });
    });
  });

  describe("recategorizeUnlockedPlaidEntries", () => {
    it("counts locked entries as skippedLocked and returns early when nothing is unlocked", async () => {
      prisma.registerEntry.count.mockResolvedValue(4);

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 0, skippedLocked: 4 });
      expect(prisma.registerEntry.update).not.toHaveBeenCalled();
      expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();

      expect(prisma.registerEntry.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ categoryLocked: true }),
      });
      // Only the unlocked-entry query runs; no LLM hint lookups.
      expect(prisma.registerEntry.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryLocked: false }),
        }),
      );
    });

    it("resolves categories from high-confidence Plaid PFC without calling the LLM", async () => {
      prisma.registerEntry.count.mockResolvedValue(2);
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({
          plaidJson: makeTx({
            merchant_name: "WHOLE FOODS MARKET",
            personal_finance_category: {
              detailed: "FOOD_AND_DRINK_GROCERIES",
              confidence_level: "HIGH",
            },
          }),
        }),
      ]);

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 1, skippedLocked: 2 });
      expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
      expect(prisma.registerEntry.update).toHaveBeenCalledTimes(1);
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-1" },
        data: { categoryId: "cat-groceries", categorySource: "pfc" },
      });
    });

    it("applies ALWAYS merchant rules deterministically (source rule)", async () => {
      prisma.merchantCategoryRule.findMany.mockResolvedValue([
        {
          applyMode: "ALWAYS",
          merchantKey: "acme corp",
          merchantEntityId: null,
          categoryId: "cat-fuel",
        },
      ]);
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({
          plaidJson: makeTx({ merchant_name: "Acme Corp", name: "ACME CORP" }),
        }),
      ]);

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 1, skippedLocked: 0 });
      expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-1" },
        data: { categoryId: "cat-fuel", categorySource: "rule" },
      });
    });

    it("treats HINT rules as few-shot only and defers those items to the LLM", async () => {
      prisma.merchantCategoryRule.findMany.mockResolvedValue([
        {
          applyMode: "HINT",
          merchantKey: "acme corp",
          merchantEntityId: null,
          categoryId: "cat-fuel",
        },
      ]);
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({
          plaidJson: makeTx({ merchant_name: "Acme Corp" }),
        }),
      ]);
      fakeClient.chat.completions.create.mockResolvedValue(
        completionWithContent(
          JSON.stringify({
            displayName: "Acme Corp",
            categoryPath: "Food & Dining / Groceries",
          }),
        ),
      );

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 1, skippedLocked: 0 });
      expect(fakeClient.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-1" },
        data: { categoryId: "cat-groceries", categorySource: "ai" },
      });
    });

    it("falls back to the LLM for undecided items and persists parsed single responses", async () => {
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({
          plaidJson: makeTx({
            name: "ODD VENDOR LLC",
            merchant_name: undefined,
          }),
        }),
      ]);
      fakeClient.chat.completions.create.mockResolvedValue(
        completionWithContent(
          JSON.stringify({
            displayName: "Odd Vendor",
            categoryPath: "Transportation / Fuel",
          }),
        ),
      );

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 1, skippedLocked: 0 });
      expect(fakeClient.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(fakeClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "test-categorize-model",
          response_format: { type: "json_object" },
        }),
      );
      // Logged through the real OpenAiCompletionLogger with the recategorize purpose.
      expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purpose: "register_entry_recategorize",
          success: true,
          model: "test-categorize-model",
        }),
      });
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-1" },
        data: { categoryId: "cat-fuel", categorySource: "ai" },
      });
    });

    it("low-confidence PFC does not short-circuit; the LLM decides instead", async () => {
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({
          plaidJson: makeTx({
            merchant_name: "WHOLE FOODS MARKET",
            personal_finance_category: {
              detailed: "FOOD_AND_DRINK_GROCERIES",
              confidence_level: "LOW",
            },
          }),
        }),
      ]);
      fakeClient.chat.completions.create.mockResolvedValue(
        completionWithContent(
          JSON.stringify({
            displayName: "Whole Foods",
            categoryPath: "Food & Dining / Groceries",
          }),
        ),
      );

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 1, skippedLocked: 0 });
      expect(fakeClient.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-1" },
        data: { categoryId: "cat-groceries", categorySource: "ai" },
      });
    });

    it("keeps entries unchanged when the LLM returns invalid JSON", async () => {
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({ plaidJson: makeTx({ merchant_name: "Odd Vendor" }) }),
      ]);
      fakeClient.chat.completions.create.mockResolvedValue(
        completionWithContent("not-json{{{"),
      );

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 0, skippedLocked: 0 });
      expect(fakeClient.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(prisma.registerEntry.update).not.toHaveBeenCalled();
    });

    it("keeps entries unchanged when the LLM completion has no choices", async () => {
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({ plaidJson: makeTx({ merchant_name: "Odd Vendor" }) }),
      ]);
      fakeClient.chat.completions.create.mockResolvedValue({
        id: "resp-2",
        choices: [],
      });

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 0, skippedLocked: 0 });
      expect(prisma.registerEntry.update).not.toHaveBeenCalled();
    });

    it("ignores LLM categoryPaths that do not resolve to a known category", async () => {
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({ plaidJson: makeTx({ merchant_name: "Odd Vendor" }) }),
      ]);
      fakeClient.chat.completions.create.mockResolvedValue(
        completionWithContent(
          JSON.stringify({
            displayName: "Odd Vendor",
            categoryPath: "Nowhere / Nothing",
          }),
        ),
      );

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 0, skippedLocked: 0 });
      expect(prisma.registerEntry.update).not.toHaveBeenCalled();
    });

    it("does not update when the resolved category already matches", async () => {
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({
          categoryId: "cat-groceries",
          plaidJson: makeTx({
            merchant_name: "WHOLE FOODS MARKET",
            personal_finance_category: {
              detailed: "FOOD_AND_DRINK_GROCERIES",
              confidence_level: "HIGH",
            },
          }),
        }),
      ]);

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 0, skippedLocked: 0 });
      expect(prisma.registerEntry.update).not.toHaveBeenCalled();
    });

    it("skips entries whose plaidJson cannot be parsed into a transaction", async () => {
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({ id: "entry-bad", plaidJson: {} }),
        makeEntry({
          id: "entry-good",
          plaidJson: makeTx({
            merchant_name: "WHOLE FOODS MARKET",
            personal_finance_category: {
              detailed: "FOOD_AND_DRINK_GROCERIES",
              confidence_level: "HIGH",
            },
          }),
        }),
      ]);

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 1, skippedLocked: 0 });
      expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
      expect(prisma.registerEntry.update).toHaveBeenCalledTimes(1);
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "entry-good" },
        data: { categoryId: "cat-groceries", categorySource: "pfc" },
      });
    });

    it("does not call the LLM when no OpenAI client is configured", async () => {
      getOpenAIClient.mockReturnValue(null);
      prisma.registerEntry.findMany.mockResolvedValue([
        makeEntry({ plaidJson: makeTx({ merchant_name: "Odd Vendor" }) }),
      ]);

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 0, skippedLocked: 0 });
      expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
      expect(prisma.registerEntry.update).not.toHaveBeenCalled();
    });

    it("batches LLM calls at 25 entries per request", async () => {
      const entries = Array.from({ length: 30 }, (_, i) =>
        makeEntry({
          id: `entry-${i}`,
          plaidJson: makeTx({
            transaction_id: `txn-${i}`,
            amount: 5 + i,
            name: `VENDOR ${i}`,
          }),
        }),
      );
      prisma.registerEntry.findMany.mockResolvedValue(entries);
      fakeClient.chat.completions.create.mockImplementation(async (body: any) => {
        const userMessage = body.messages.find(
          (m: any) => m.role === "user",
        ).content as string;
        const items = llmItemsFromUserMessage(userMessage);
        return completionWithContent(
          JSON.stringify({
            results: items.map((row: any) => ({
              id: row.id,
              categoryPath: "Food & Dining / Groceries",
            })),
          }),
        );
      });

      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        userId: null,
      });

      expect(result).toEqual({ updated: 30, skippedLocked: 0 });
      expect(fakeClient.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(prisma.registerEntry.update).toHaveBeenCalledTimes(30);
    });

    it("scopes count and findMany to the given accountRegisterId", async () => {
      await service.recategorizeUnlockedPlaidEntries({
        accountId: ACCOUNT_ID,
        accountRegisterId: REGISTER_ID,
        userId: 5,
      });

      expect(prisma.registerEntry.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          register: { accountId: ACCOUNT_ID, id: REGISTER_ID },
        }),
      });
      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            register: { accountId: ACCOUNT_ID, id: REGISTER_ID },
          }),
        }),
      );
    });
  });

  describe("classify / classifyMany", () => {
    it("returns fallback results without DB access when accountId is blank", async () => {
      const result = await service.classify({
        transaction: makeTx(),
        accountId: "   ",
        context: {
          userId: null,
          accountRegisterId: REGISTER_ID,
          accountId: "   ",
        },
      });

      expect(result).toEqual({
        description: "WHOLE FOODS MARKET",
        categoryId: null,
        source: null,
      });
      expect(prisma.category.findMany).not.toHaveBeenCalled();
      expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
    });

    it("returns an empty array from classifyMany for empty items", async () => {
      const result = await service.classifyMany({
        items: [],
        accountId: ACCOUNT_ID,
        context: {
          userId: null,
          accountRegisterId: REGISTER_ID,
          accountId: ACCOUNT_ID,
        },
      });

      expect(result).toEqual([]);
    });

    it("classify returns fallback shape when the DB category lookup fails", async () => {
      prisma.category.findMany.mockRejectedValue(new Error("db down"));

      const result = await service.classify({
        transaction: makeTx(),
        accountId: ACCOUNT_ID,
        context: {
          userId: null,
          accountRegisterId: REGISTER_ID,
          accountId: ACCOUNT_ID,
        },
      });

      expect(result).toEqual({
        description: "WHOLE FOODS MARKET",
        categoryId: null,
        source: null,
      });
    });

    it("classify maps a single LLM response, using displayName when updateDescription is on", async () => {
      fakeClient.chat.completions.create.mockResolvedValue(
        completionWithContent(
          JSON.stringify({
            displayName: "Odd Vendor",
            categoryPath: "Transportation / Fuel",
          }),
        ),
      );

      const result = await service.classify({
        transaction: makeTx({
          name: "ODD VENDOR LLC",
          merchant_name: undefined,
        }),
        accountId: ACCOUNT_ID,
        context: {
          userId: 5,
          accountRegisterId: REGISTER_ID,
          accountId: ACCOUNT_ID,
          plaidTransactionId: "plaid-txn-9",
        },
      });

      expect(result).toEqual({
        description: "Odd Vendor",
        categoryId: "cat-fuel",
        source: "ai",
      });
      expect(fakeClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "test-categorize-model",
          response_format: { type: "json_object" },
        }),
      );
      expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purpose: "plaid_transaction_enrichment",
          metadata: expect.objectContaining({
            plaidTransactionId: "plaid-txn-9",
            batchSize: 1,
          }),
        }),
      });
    });
  });
});
