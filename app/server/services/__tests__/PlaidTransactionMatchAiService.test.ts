import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "plaid";
import type { AccountRegister, AccountType } from "~/types/test-types";
import PlaidTransactionMatchAiService from "../PlaidTransactionMatchAiService";

const mockEnv = vi.hoisted(() => ({
  OPENAI_API_KEY: "test-key",
  OPENAI_PLAID_MATCH_MODEL: "test-match-model",
  OPENAI_PLAID_MATCH_MIN_CONFIDENCE: 0.7,
}));

vi.mock("~/server/env", () => ({ default: mockEnv }));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/clients/openaiClient", () => ({
  getOpenAIClient: vi.fn(),
}));

vi.mock("~/server/services/OpenAiCompletionLogger", () => ({
  loggedChatCompletion: vi.fn(),
}));

const USER_ID = 5;
const REGISTER_ID = 7;
const ACCOUNT_ID = "acct-1";
const CAT_UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CAT_OTHER_UUID = "11111111-2222-4333-8444-555555555555";

function makeTx(overrides: Record<string, unknown> = {}): Transaction {
  return {
    transaction_id: "txn-1",
    amount: 15,
    date: "2024-01-05",
    name: "NETFLIX.COM",
    merchant_name: "NETFLIX.COM",
    ...overrides,
  } as unknown as Transaction;
}

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    plaidTransactionId: "txn-1",
    entryId: null,
    reoccurrenceId: null,
    confidence: 0.9,
    displayName: "Netflix",
    categoryId: CAT_UUID,
    ...overrides,
  };
}

function completionWithContent(content: string) {
  return {
    id: "resp-1",
    model: mockEnv.OPENAI_PLAID_MATCH_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  };
}

describe("PlaidTransactionMatchAiService", () => {
  let loggedChatCompletion: any;
  let getOpenAIClient: any;
  let fakeClient: { chat: { completions: { create: any } } };
  let mockDb: any;
  let service: PlaidTransactionMatchAiService;

  const accountRegister = {
    id: REGISTER_ID,
    accountId: ACCOUNT_ID,
  } as unknown as AccountRegister;
  const accountType = { isCredit: false } as unknown as AccountType;
  const context = {
    userId: USER_ID,
    accountRegisterId: REGISTER_ID,
    accountId: ACCOUNT_ID,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockEnv.OPENAI_API_KEY = "test-key";
    ({ loggedChatCompletion } = await import(
      "~/server/services/OpenAiCompletionLogger"
    ));
    ({ getOpenAIClient } = await import("~/server/clients/openaiClient"));

    fakeClient = { chat: { completions: { create: vi.fn() } } };
    getOpenAIClient.mockReturnValue(fakeClient);
    loggedChatCompletion.mockResolvedValue(
      completionWithContent(JSON.stringify({ matches: [] })),
    );

    mockDb = {
      category: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            {
              id: CAT_UUID,
              name: "Subscriptions",
              subCategoryId: null,
              isArchived: false,
              accountId: ACCOUNT_ID,
            },
          ]),
      },
      reoccurrence: { findMany: vi.fn().mockResolvedValue([]) },
      registerEntry: { findMany: vi.fn().mockResolvedValue([]) },
    };

    service = new PlaidTransactionMatchAiService(mockDb);
  });

  it("returns an empty map immediately for an empty transaction list", async () => {
    const result = await service.matchBatch({
      transactions: [],
      accountRegister,
      accountType,
      context,
    });

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(loggedChatCompletion).not.toHaveBeenCalled();
    expect(mockDb.category.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty map when no OpenAI client is configured", async () => {
    getOpenAIClient.mockReturnValue(null);

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(0);
    expect(mockDb.category.findMany).not.toHaveBeenCalled();
    expect(loggedChatCompletion).not.toHaveBeenCalled();
  });

  it("returns an empty map when OPENAI_API_KEY is not set", async () => {
    mockEnv.OPENAI_API_KEY = "";

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(0);
    expect(loggedChatCompletion).not.toHaveBeenCalled();
  });

  it("returns an empty map when the account register has no accountId", async () => {
    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister: { id: REGISTER_ID, accountId: "   " } as AccountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(0);
    expect(mockDb.category.findMany).not.toHaveBeenCalled();
    expect(loggedChatCompletion).not.toHaveBeenCalled();
  });

  it("returns an empty map when the category lookup fails", async () => {
    mockDb.category.findMany.mockRejectedValue(new Error("db down"));

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(0);
    expect(loggedChatCompletion).not.toHaveBeenCalled();
  });

  it("matches a transaction to a reoccurrence on the happy path", async () => {
    mockDb.reoccurrence.findMany.mockResolvedValue([
      {
        id: 5,
        description: "Netflix",
        amount: 15,
        categoryId: CAT_UUID,
        plaidNameAliases: [],
        billProfile: null,
      },
    ]);
    loggedChatCompletion.mockResolvedValue(
      completionWithContent(
        JSON.stringify({ matches: [makeMatch({ reoccurrenceId: 5 })] }),
      ),
    );

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(1);
    expect(result.get("txn-1")).toEqual({
      plaidTransactionId: "txn-1",
      entryId: null,
      reoccurrenceId: 5,
      confidence: 0.9,
      displayName: "Netflix",
      categoryId: CAT_UUID,
    });

    expect(loggedChatCompletion).toHaveBeenCalledTimes(1);
    expect(loggedChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "plaid_transaction_match",
        metadata: {
          userId: USER_ID,
          accountRegisterId: REGISTER_ID,
          accountId: ACCOUNT_ID,
          transactionCount: 1,
        },
        body: expect.objectContaining({
          model: "test-match-model",
          response_format: { type: "json_object" },
        }),
      }),
    );
    expect(mockDb.reoccurrence.findMany).toHaveBeenCalledWith({
      where: { accountRegisterId: REGISTER_ID },
      include: expect.any(Object),
    });
  });

  it("nulls entryId and reoccurrenceId below the minimum confidence but keeps the suggestion", async () => {
    loggedChatCompletion.mockResolvedValue(
      completionWithContent(
        JSON.stringify({
          matches: [
            makeMatch({ confidence: 0.4, entryId: "entry-1", reoccurrenceId: 5 }),
          ],
        }),
      ),
    );

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.get("txn-1")).toEqual({
      plaidTransactionId: "txn-1",
      entryId: null,
      reoccurrenceId: null,
      confidence: 0.4,
      displayName: "Netflix",
      categoryId: CAT_UUID,
    });
  });

  it("drops matches for plaid transaction ids that were not requested", async () => {
    loggedChatCompletion.mockResolvedValue(
      completionWithContent(
        JSON.stringify({
          matches: [makeMatch({ plaidTransactionId: "not-requested" })],
        }),
      ),
    );

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(0);
  });

  it("only accepts entryIds that exist in candidates and each at most once", async () => {
    mockDb.registerEntry.findMany
      .mockResolvedValueOnce([
        {
          id: "entry-1",
          createdAt: new Date("2024-01-05T00:00:00.000Z"),
          amount: -15,
          description: "Netflix",
          reoccurrenceId: null,
          isProjected: true,
        },
      ])
      .mockResolvedValueOnce([]); // recent categorized entries

    loggedChatCompletion.mockResolvedValue(
      completionWithContent(
        JSON.stringify({
          matches: [
            makeMatch({ plaidTransactionId: "txn-1", entryId: "entry-1" }),
            makeMatch({ plaidTransactionId: "txn-2", entryId: "entry-1" }),
            makeMatch({
              plaidTransactionId: "txn-3",
              entryId: "entry-missing",
            }),
          ],
        }),
      ),
    );

    const transactions = [
      makeTx(),
      makeTx({ transaction_id: "txn-2" }),
      makeTx({ transaction_id: "txn-3" }),
    ];
    const result = await service.matchBatch({
      transactions,
      accountRegister,
      accountType,
      context,
    });

    expect(result.get("txn-1")?.entryId).toBe("entry-1");
    expect(result.get("txn-2")?.entryId).toBeNull();
    expect(result.get("txn-3")?.entryId).toBeNull();
    // Candidate query filters to manual (plaid-less) entries near the batch dates.
    expect(mockDb.registerEntry.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          accountRegisterId: REGISTER_ID,
          plaidId: null,
          isBalanceEntry: false,
        }),
        take: 200,
      }),
    );
  });

  it("drops an entry match once that entryId has been used in the same batch", async () => {
    mockDb.registerEntry.findMany
      .mockResolvedValueOnce([
        {
          id: "entry-1",
          createdAt: new Date("2024-01-05T00:00:00.000Z"),
          amount: -15,
          description: "Netflix",
          reoccurrenceId: null,
          isProjected: true,
        },
      ])
      .mockResolvedValueOnce([]);

    loggedChatCompletion.mockResolvedValue(
      completionWithContent(
        JSON.stringify({
          matches: [
            makeMatch({ plaidTransactionId: "txn-1", entryId: "entry-1" }),
            makeMatch({ plaidTransactionId: "txn-2", entryId: "entry-1" }),
          ],
        }),
      ),
    );

    const result = await service.matchBatch({
      transactions: [makeTx(), makeTx({ transaction_id: "txn-2" })],
      accountRegister,
      accountType,
      context,
    });

    expect(result.get("txn-1")?.entryId).toBe("entry-1");
    expect(result.get("txn-2")?.entryId).toBeNull();
  });

  it("drops reoccurrence ids that do not exist, and prefers entryId when both are given", async () => {
    mockDb.registerEntry.findMany
      .mockResolvedValueOnce([
        {
          id: "entry-1",
          createdAt: new Date("2024-01-05T00:00:00.000Z"),
          amount: -15,
          description: "Netflix",
          reoccurrenceId: null,
          isProjected: true,
        },
      ])
      .mockResolvedValueOnce([]);

    loggedChatCompletion.mockResolvedValue(
      completionWithContent(
        JSON.stringify({
          matches: [
            makeMatch({
              plaidTransactionId: "txn-1",
              entryId: "entry-1",
              reoccurrenceId: 5,
            }),
            makeMatch({
              plaidTransactionId: "txn-2",
              reoccurrenceId: 999,
            }),
          ],
        }),
      ),
    );

    const result = await service.matchBatch({
      transactions: [makeTx(), makeTx({ transaction_id: "txn-2" })],
      accountRegister,
      accountType,
      context,
    });

    expect(result.get("txn-1")?.entryId).toBe("entry-1");
    expect(result.get("txn-1")?.reoccurrenceId).toBeNull();
    expect(result.get("txn-2")?.entryId).toBeNull();
    expect(result.get("txn-2")?.reoccurrenceId).toBeNull();
  });

  it("nulls categoryIds outside the account's allowed categories", async () => {
    loggedChatCompletion.mockResolvedValue(
      completionWithContent(
        JSON.stringify({
          matches: [makeMatch({ categoryId: CAT_OTHER_UUID })],
        }),
      ),
    );

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.get("txn-1")?.categoryId).toBeNull();
  });

  it("clips long display names and falls back to the Plaid label for empty ones", async () => {
    loggedChatCompletion.mockResolvedValue(
      completionWithContent(
        JSON.stringify({
          matches: [
            makeMatch({
              plaidTransactionId: "txn-1",
              displayName: "x".repeat(1600),
            }),
            makeMatch({
              plaidTransactionId: "txn-2",
              displayName: "   ",
            }),
          ],
        }),
      ),
    );

    const result = await service.matchBatch({
      transactions: [makeTx(), makeTx({ transaction_id: "txn-2" })],
      accountRegister,
      accountType,
      context,
    });

    expect(result.get("txn-1")?.displayName).toHaveLength(1500);
    expect(result.get("txn-2")?.displayName).toBe("NETFLIX.COM");
  });

  it("returns an empty map when the model returns invalid JSON", async () => {
    loggedChatCompletion.mockResolvedValue(
      completionWithContent("not-json{{{"),
    );

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(0);
  });

  it("returns an empty map when the completion has no choices", async () => {
    loggedChatCompletion.mockResolvedValue({ id: "resp-2", choices: [] });

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(0);
  });

  it("returns an empty map when the model payload fails schema validation", async () => {
    loggedChatCompletion.mockResolvedValue(
      completionWithContent(
        JSON.stringify({
          matches: [{ plaidTransactionId: "txn-1", confidence: 0.9 }],
        }),
      ),
    );

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(0);
  });

  it("returns an empty map when the LLM call throws", async () => {
    loggedChatCompletion.mockRejectedValue(new Error("rate limited"));

    const result = await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(0);
  });

  it("formats register amounts negative for debit accounts and positive for credit accounts", async () => {
    loggedChatCompletion.mockResolvedValue(
      completionWithContent(JSON.stringify({ matches: [] })),
    );

    await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType,
      context,
    });
    await service.matchBatch({
      transactions: [makeTx()],
      accountRegister,
      accountType: { isCredit: true } as unknown as AccountType,
      context,
    });

    const firstUserMessage = (
      loggedChatCompletion.mock.calls[0][0].body.messages as Array<{
        role: string;
        content: string;
      }>
    ).find((m) => m.role === "user")!.content;
    const firstLine = firstUserMessage
      .split("\n")
      .find((line) => line.includes('"plaidTransactionId"'))!;
    expect(JSON.parse(firstLine)).toEqual(
      expect.objectContaining({ plaidTransactionId: "txn-1", amount: -15 }),
    );

    const secondUserMessage = (
      loggedChatCompletion.mock.calls[1][0].body.messages as Array<{
        role: string;
        content: string;
      }>
    ).find((m) => m.role === "user")!.content;
    const secondLine = secondUserMessage
      .split("\n")
      .find((line) => line.includes('"plaidTransactionId"'))!;
    expect(JSON.parse(secondLine)).toEqual(
      expect.objectContaining({ plaidTransactionId: "txn-1", amount: 15 }),
    );
  });

  it("chunks large transaction lists into multiple model calls", async () => {
    const transactions = Array.from({ length: 30 }, (_, i) =>
      makeTx({ transaction_id: `txn-${i}`, amount: 10 + i }),
    );
    loggedChatCompletion.mockImplementation(async (params: any) => {
      const userMessage = (
        params.body.messages as Array<{ role: string; content: string }>
      ).find((m) => m.role === "user")!.content;
      const ids = [
        ...userMessage.matchAll(/"plaidTransactionId":"([^"]+)"/g),
      ].map((m) => m[1]!);
      return completionWithContent(
        JSON.stringify({
          matches: ids.map((id) => makeMatch({ plaidTransactionId: id })),
        }),
      );
    });

    const result = await service.matchBatch({
      transactions,
      accountRegister,
      accountType,
      context,
    });

    expect(result.size).toBe(30);
    expect(loggedChatCompletion).toHaveBeenCalledTimes(2);
    // Candidates + recent categorized entries are reloaded for each batch.
    expect(mockDb.registerEntry.findMany).toHaveBeenCalledTimes(4);
  });
});
