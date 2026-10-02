import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateAssetValue } from "../AssetValueEstimateService";

const mockEnv = vi.hoisted(() => ({
  OPENAI_API_KEY: "test-key",
  OPENAI_ASSET_VALUE_MODEL: "test-asset-model",
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

const VEHICLE_DISCLAIMER =
  "This is a rough illustrative estimate for budgeting only, not an appraisal or licensed guidebook value (e.g. not KBB/NADA).";

function vehicleInput(overrides: Record<string, unknown> = {}) {
  return {
    category: "vehicle" as const,
    accountId: "acct-1",
    year: 2020,
    make: "Toyota",
    model: "Camry",
    mileage: 30000,
    condition: "good" as const,
    ...overrides,
  };
}

function estimateJson(overrides: Record<string, unknown> = {}) {
  return {
    estimatedValueMid: 15000,
    estimatedValueLow: 13000,
    estimatedValueHigh: 17000,
    currency: "USD",
    rationale: "Based on mileage and condition.",
    disclaimer: VEHICLE_DISCLAIMER,
    ...overrides,
  };
}

function completionWithContent(content: string) {
  return {
    id: "resp-1",
    model: mockEnv.OPENAI_ASSET_VALUE_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

function errorFrom(promise: Promise<unknown>): Promise<any> {
  return promise.catch((err) => err);
}

describe("estimateAssetValue", () => {
  let prisma: any;
  let getOpenAIClient: any;
  let fakeClient: { chat: { completions: { create: any } } };
  let consoleErrorSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ prisma } = await import("~/server/clients/prismaClient"));
    ({ getOpenAIClient } = await import("~/server/clients/openaiClient"));

    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    fakeClient = { chat: { completions: { create: vi.fn() } } };
    getOpenAIClient.mockReturnValue(fakeClient);
    fakeClient.chat.completions.create.mockResolvedValue(
      completionWithContent(JSON.stringify(estimateJson())),
    );

    prisma.account.findFirstOrThrow.mockResolvedValue({ id: "acct-1" });
    prisma.accountRegister.findFirst.mockResolvedValue(null);
    prisma.openAiRequestLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    mockEnv.OPENAI_API_KEY = "test-key";
    delete mockEnv.OPENAI_VEHICLE_VALUE_MODEL;
    mockEnv.OPENAI_ASSET_VALUE_MODEL = "test-asset-model";
  });

  it("verifies account ownership and returns the parsed structured estimate", async () => {
    const result = await estimateAssetValue({
      userId: 5,
      input: vehicleInput(),
    });

    expect(result).toEqual(estimateJson());
    expect(prisma.account.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: "acct-1",
        userAccounts: { some: { userId: 5 } },
      },
    });
    expect(prisma.accountRegister.findFirst).not.toHaveBeenCalled();
  });

  it("sends the category system prompt and JSON user payload to the configured model", async () => {
    await estimateAssetValue({ userId: 5, input: vehicleInput() });

    expect(fakeClient.chat.completions.create).toHaveBeenCalledTimes(1);
    const args = fakeClient.chat.completions.create.mock.calls[0][0];
    expect(args.model).toBe("test-asset-model");
    expect(args.response_format).toEqual({ type: "json_object" });
    expect(args.messages).toHaveLength(2);
    expect(args.messages[0].role).toBe("system");
    expect(args.messages[0].content).toContain("vehicle values");
    expect(args.messages[1].role).toBe("user");
    const userPayload = JSON.parse(
      args.messages[1].content.slice(
        args.messages[1].content.indexOf("{"),
        args.messages[1].content.lastIndexOf("}") + 1,
      ),
    );
    expect(userPayload).toEqual(
      expect.objectContaining({
        year: 2020,
        make: "Toyota",
        model: "Camry",
        mileage: 30000,
        condition: "good",
      }),
    );
    expect(userPayload).not.toHaveProperty("accountId");
    expect(args.messages[1].content).toContain(VEHICLE_DISCLAIMER);
  });

  it("logs a success row including the parsed estimate via metadataFromResponse", async () => {
    await estimateAssetValue({ userId: 5, input: vehicleInput() });

    expect(prisma.openAiRequestLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: "vehicle_value_estimate",
        success: true,
        model: "test-asset-model",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        metadata: expect.objectContaining({
          userId: 5,
          accountId: "acct-1",
          accountRegisterId: null,
          category: "vehicle",
          result: expect.objectContaining({
            estimatedValueMid: 15000,
            estimatedValueLow: 13000,
            estimatedValueHigh: 17000,
          }),
        }),
      }),
    });
  });

  it("validates that the register exists, belongs to the account, and is not archived", async () => {
    prisma.accountRegister.findFirst.mockResolvedValue(null);

    const err = await errorFrom(
      estimateAssetValue({
        userId: 5,
        input: vehicleInput({ accountRegisterId: 42 }),
      }),
    );

    expect(err.statusCode).toBe(400);
    expect(err.message).toContain("not found or not accessible");
    expect(prisma.accountRegister.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 42,
        accountId: "acct-1",
        isArchived: false,
      }),
    });
    expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
  });

  it("rejects a register whose account type does not match the asset category", async () => {
    prisma.accountRegister.findFirst.mockResolvedValue({ typeId: 23 }); // house

    const err = await errorFrom(
      estimateAssetValue({
        userId: 5,
        input: vehicleInput({ accountRegisterId: 42 }),
      }),
    );

    expect(err.statusCode).toBe(400);
    expect(err.message).toContain(
      "does not match this register's account type",
    );
    expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
  });

  it("proceeds when the register type matches the category (vehicle = 20)", async () => {
    prisma.accountRegister.findFirst.mockResolvedValue({ typeId: 20 });

    const result = await estimateAssetValue({
      userId: 5,
      input: vehicleInput({ accountRegisterId: 42 }),
    });

    expect(result).toEqual(estimateJson());
    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ accountRegisterId: 42 }),
      }),
    });
  });

  it("propagates ownership lookup failures for unknown accounts", async () => {
    prisma.account.findFirstOrThrow.mockRejectedValue(
      new Error("P2025: account not found"),
    );

    await expect(
      estimateAssetValue({ userId: 5, input: vehicleInput() }),
    ).rejects.toThrow("P2025: account not found");
    expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
  });

  it("throws 503 when OpenAI is not configured", async () => {
    getOpenAIClient.mockReturnValue(null);

    const err = await errorFrom(
      estimateAssetValue({ userId: 5, input: vehicleInput() }),
    );

    expect(err.statusCode).toBe(503);
    expect(err.message).toContain("OpenAI is not configured");
    expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
  });

  it("throws 503 when the API key is missing even with a client", async () => {
    mockEnv.OPENAI_API_KEY = "";

    const err = await errorFrom(
      estimateAssetValue({ userId: 5, input: vehicleInput() }),
    );

    expect(err.statusCode).toBe(503);
    expect(fakeClient.chat.completions.create).not.toHaveBeenCalled();
    mockEnv.OPENAI_API_KEY = "test-key";
  });

  it("throws 502 and logs a failure row when the model returns empty content", async () => {
    fakeClient.chat.completions.create.mockResolvedValue(
      completionWithContent("   "),
    );

    const err = await errorFrom(
      estimateAssetValue({ userId: 5, input: vehicleInput() }),
    );

    expect(err.statusCode).toBe(502);
    expect(err.message).toContain("returned an empty response");
    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: "vehicle_value_estimate",
        success: false,
        errorMessage: expect.stringContaining("empty response"),
        metadata: expect.not.objectContaining({ result: expect.anything() }),
      }),
    });
  });

  it("throws 502 when the model returns non-JSON content", async () => {
    fakeClient.chat.completions.create.mockResolvedValue(
      completionWithContent("I think it is worth about fifteen grand."),
    );

    const err = await errorFrom(
      estimateAssetValue({ userId: 5, input: vehicleInput() }),
    );

    expect(err.statusCode).toBe(502);
    expect(err.message).toContain("not valid JSON");
    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining("not valid JSON"),
      }),
    });
  });

  it("throws 502 when the model JSON does not match the result schema", async () => {
    fakeClient.chat.completions.create.mockResolvedValue(
      completionWithContent(
        JSON.stringify(estimateJson({ rationale: "x".repeat(900) })),
      ),
    );

    const err = await errorFrom(
      estimateAssetValue({ userId: 5, input: vehicleInput() }),
    );

    expect(err.statusCode).toBe(502);
    expect(err.message).toContain("could not be parsed");
  });

  it("maps house estimates to the house logging purpose", async () => {
    fakeClient.chat.completions.create.mockResolvedValue(
      completionWithContent(
        JSON.stringify(
          estimateJson({
            disclaimer:
              "This is a rough illustrative estimate for budgeting only, not a professional appraisal, broker price opinion, or automated valuation model (e.g. not a substitute for MLS or Zillow-style AVMs for lending).",
          }),
        ),
      ),
    );

    const result = await estimateAssetValue({
      userId: 5,
      input: {
        category: "house" as const,
        accountId: "acct-1",
        bedrooms: 3,
        bathrooms: 2,
        squareFootage: 1800,
        yearBuilt: 1995,
        zip: "12345",
        propertyType: "single-family" as const,
        condition: "good" as const,
      },
    });

    expect(result).toEqual(
      expect.objectContaining({ estimatedValueMid: 15000 }),
    );
    expect(prisma.openAiRequestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: "house_value_estimate",
        metadata: expect.objectContaining({
          category: "house",
          assetInputSummary: expect.objectContaining({
            bedrooms: 3,
            squareFootage: 1800,
          }),
        }),
      }),
    });
  });

  it("falls back through OPENAI_VEHICLE_VALUE_MODEL to the default model", async () => {
    delete mockEnv.OPENAI_ASSET_VALUE_MODEL;
    mockEnv.OPENAI_VEHICLE_VALUE_MODEL = "fallback-model";

    await estimateAssetValue({ userId: 5, input: vehicleInput() });

    expect(fakeClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "fallback-model" }),
    );
  });
});
