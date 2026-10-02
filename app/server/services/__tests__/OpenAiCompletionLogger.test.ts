import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loggedChatCompletion } from "../OpenAiCompletionLogger";

const DEFAULT_NOW = Date.parse("2024-01-01T00:00:00.000Z");
const mockNow = vi.hoisted(() => vi.fn());

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: { now: mockNow },
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
  logRequest: vi.fn(),
}));

vi.mock("~/server/services/integrationOpsAlert", () => ({
  isOpenAiCredentialFailure: vi.fn(() => false),
  notifyIntegrationAlert: vi.fn(),
}));

function completion(overrides: Record<string, unknown> = {}) {
  return {
    id: "resp_123",
    model: "gpt-5-nano",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "hi" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    ...overrides,
  };
}

const baseBody = {
  model: "gpt-5-nano",
  messages: [{ role: "user", content: "hi" }],
  response_format: { type: "json_object" },
} as any;

describe("loggedChatCompletion", () => {
  let prisma: any;
  let log: any;
  let isOpenAiCredentialFailure: any;
  let notifyIntegrationAlert: any;
  let fakeClient: { chat: { completions: { create: any } } };
  let consoleErrorSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockNow.mockReturnValue(DEFAULT_NOW);
    ({ prisma } = await import("~/server/clients/prismaClient"));
    ({ log } = await import("~/server/logger"));
    ({ isOpenAiCredentialFailure, notifyIntegrationAlert } = await import(
      "~/server/services/integrationOpsAlert"
    ));
    isOpenAiCredentialFailure.mockReturnValue(false);
    notifyIntegrationAlert.mockResolvedValue(undefined);

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    fakeClient = { chat: { completions: { create: vi.fn() } } };
    prisma.openAiRequestLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("logs a success row with model, token usage, and cached tokens, and passes the completion through", async () => {
    const response = completion({
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        prompt_tokens_details: { cached_tokens: 4 },
      },
    });
    fakeClient.chat.completions.create.mockResolvedValue(response);

    const result = await loggedChatCompletion({
      client: fakeClient as any,
      body: baseBody,
      purpose: "unit_test",
      metadata: { userId: 1 },
    });

    expect(result).toBe(response);
    expect(fakeClient.chat.completions.create).toHaveBeenCalledWith(baseBody);
    expect(prisma.openAiRequestLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: {
        purpose: "unit_test",
        model: "gpt-5-nano",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        cachedPromptTokens: 4,
        openaiResponseId: "resp_123",
        finishReason: "stop",
        durationMs: 0,
        success: true,
        errorMessage: null,
        httpStatus: null,
        metadata: { userId: 1 },
      },
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "OpenAI chat completion",
        level: "info",
        data: expect.objectContaining({ success: true, purpose: "unit_test" }),
      }),
    );
  });

  it("falls back to the body model and null token fields when the response omits them", async () => {
    const body = { ...baseBody, model: "fallback-model" };
    fakeClient.chat.completions.create.mockResolvedValue(
      completion({ model: undefined, usage: undefined }),
    );

    await loggedChatCompletion({
      client: fakeClient as any,
      body,
      purpose: "unit_test",
    });

    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        model: "fallback-model",
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        cachedPromptTokens: null,
      }),
    });
  });

  it("measures durationMs from the dateTimeService clock", async () => {
    mockNow.mockReset();
    mockNow.mockReturnValueOnce(DEFAULT_NOW);
    mockNow.mockReturnValueOnce(DEFAULT_NOW + 50);
    fakeClient.chat.completions.create.mockResolvedValue(completion());

    await loggedChatCompletion({
      client: fakeClient as any,
      body: baseBody,
      purpose: "unit_test",
    });

    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ durationMs: 50, success: true }),
    });
  });

  it("uses the merged metadata from metadataFromResponse on success", async () => {
    const response = completion();
    fakeClient.chat.completions.create.mockResolvedValue(response);
    const metadataFromResponse = vi.fn(async (resp: any) => ({
      userId: 1,
      parsed: resp.choices[0]?.message?.content,
    }));

    await loggedChatCompletion({
      client: fakeClient as any,
      body: baseBody,
      purpose: "unit_test",
      metadata: { userId: 1 },
      metadataFromResponse,
    });

    expect(metadataFromResponse).toHaveBeenCalledWith(response);
    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        success: true,
        metadata: { userId: 1, parsed: "hi" },
      }),
    });
  });

  it("persists a failure row and rethrows when the LLM call fails", async () => {
    fakeClient.chat.completions.create.mockRejectedValue(new Error("boom"));

    await expect(
      loggedChatCompletion({
        client: fakeClient as any,
        body: baseBody,
        purpose: "unit_test",
        metadata: { userId: 1 },
      }),
    ).rejects.toThrow("boom");

    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: {
        purpose: "unit_test",
        model: "gpt-5-nano",
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        cachedPromptTokens: null,
        openaiResponseId: null,
        finishReason: null,
        durationMs: 0,
        success: false,
        errorMessage: "boom",
        httpStatus: null,
        metadata: { userId: 1 },
      },
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "OpenAI chat completion failed",
        level: "warn",
      }),
    );
    expect(notifyIntegrationAlert).not.toHaveBeenCalled();
  });

  it("records httpStatus from err.status on provider errors", async () => {
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    fakeClient.chat.completions.create.mockRejectedValue(err);

    await expect(
      loggedChatCompletion({
        client: fakeClient as any,
        body: baseBody,
        purpose: "unit_test",
      }),
    ).rejects.toThrow("rate limited");

    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ success: false, httpStatus: 429 }),
    });
  });

  it("sends a credential alert when the failure is a credential problem", async () => {
    isOpenAiCredentialFailure.mockReturnValue(true);
    fakeClient.chat.completions.create.mockRejectedValue(
      new Error("invalid api key"),
    );

    await expect(
      loggedChatCompletion({
        client: fakeClient as any,
        body: baseBody,
        purpose: "unit_test",
        metadata: { userId: 1 },
      }),
    ).rejects.toThrow("invalid api key");

    expect(notifyIntegrationAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "openai",
        kind: "credential",
        dedupeKey: "openai:credential:unit_test",
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "OpenAI chat completion failed",
        level: "error",
      }),
    );
  });

  it("swallows log-row insert failures and rethrows the original error", async () => {
    fakeClient.chat.completions.create.mockRejectedValue(new Error("boom"));
    prisma.openAiRequestLog.create.mockRejectedValue(new Error("db down"));

    await expect(
      loggedChatCompletion({
        client: fakeClient as any,
        body: baseBody,
        purpose: "unit_test",
      }),
    ).rejects.toThrow("boom");

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "OpenAiRequestLog insert failed",
        level: "error",
      }),
    );
  });

  it("persists a failure row with the original metadata when metadataFromResponse throws", async () => {
    fakeClient.chat.completions.create.mockResolvedValue(completion());

    await expect(
      loggedChatCompletion({
        client: fakeClient as any,
        body: baseBody,
        purpose: "unit_test",
        metadata: { userId: 1 },
        metadataFromResponse: vi.fn(async () => {
          throw new Error("parse fail");
        }),
      }),
    ).rejects.toThrow("parse fail");

    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        success: false,
        errorMessage: "parse fail",
        metadata: { userId: 1 },
      }),
    });
  });
});
