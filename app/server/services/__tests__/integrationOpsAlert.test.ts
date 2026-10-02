import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
  DEPLOY_ENV: undefined as string | undefined,
  INTEGRATION_ALERT_EMAIL: undefined as string | undefined,
}));
vi.mock("~/server/env", () => ({ default: envState }));
vi.mock("~/server/clients/prismaClient", () => ({ prisma: {} }));
vi.mock("~/server/logger", () => ({ log: vi.fn() }));

const { sendEmail, redisSet } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  redisSet: vi.fn(),
}));
vi.mock("~/server/clients/postmarkClient", () => ({
  hasPostmarkToken: true,
  postmarkClient: { sendEmail },
}));

vi.mock("~/server/clients/redisClient", () => ({
  sharedRedisConnection: { set: redisSet },
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    nowDate: vi.fn(() => new Date("2024-06-15T08:00:00.000Z")),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import {
  isOpenAiCredentialFailure,
  notifyIntegrationAlert,
} from "../integrationOpsAlert";
// eslint-disable-next-line import/first -- mocks must be registered first
import { log } from "~/server/logger";

describe("isOpenAiCredentialFailure", () => {
  it("flags HTTP 401 regardless of message", () => {
    expect(isOpenAiCredentialFailure(401, "")).toBe(true);
  });

  it("flags known credential error messages", () => {
    expect(isOpenAiCredentialFailure(null, "Error: INVALID_API_KEY provided")).toBe(true);
    expect(isOpenAiCredentialFailure(500, "Incorrect API key supplied")).toBe(true);
    expect(isOpenAiCredentialFailure(502, "invalid api key")).toBe(true);
  });

  it("does not flag other failures", () => {
    expect(isOpenAiCredentialFailure(429, "rate limit exceeded")).toBe(false);
    expect(isOpenAiCredentialFailure(500, "server exploded")).toBe(false);
    expect(isOpenAiCredentialFailure(null, "")).toBe(false);
  });
});

describe("notifyIntegrationAlert", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    redisSet.mockReset();
    envState.DEPLOY_ENV = "staging";
    envState.INTEGRATION_ALERT_EMAIL = "ops@dineros.cc";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("logs the alert and skips email in the test environment", async () => {
    await notifyIntegrationAlert({
      source: "plaid",
      kind: "credential",
      message: "Plaid credentials rejected",
      httpStatus: 401,
    });

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Integration alert",
        level: "error",
      }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: expect.stringContaining("email skipped"),
      }),
    );
  });

  it("emails ops in a production-like environment with escaped details", async () => {
    process.env.NODE_ENV = "production";
    redisSet.mockResolvedValue("OK");

    await notifyIntegrationAlert({
      source: "openai",
      kind: "other",
      message: "OpenAI <quota> & limits",
      details: { key: "<script>alert(1)</script>" },
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const email = sendEmail.mock.calls[0][0];
    expect(email.To).toBe("ops@dineros.cc");
    expect(email.Subject).toBe("[Dineros] OPENAI other alert");
    expect(email.HtmlBody).toContain("OpenAI &lt;quota&gt; &amp; limits");
    expect(email.HtmlBody).not.toContain("<script>");
    expect(email.HtmlBody).toContain("<strong>Source:</strong> openai");
  });

  it("falls back to the admin email when no alert recipient is configured", async () => {
    process.env.NODE_ENV = "production";
    delete envState.INTEGRATION_ALERT_EMAIL;
    redisSet.mockResolvedValue("OK");

    await notifyIntegrationAlert({
      source: "plaid",
      kind: "other",
      message: "sync failed",
    });

    expect(sendEmail.mock.calls[0][0].To).toBe("admin@dineros.cc");
  });

  it("throttles repeat emails for the same dedupe key via redis NX cooldown", async () => {
    process.env.NODE_ENV = "production";
    redisSet
      .mockResolvedValueOnce("OK") // first email allowed
      .mockResolvedValueOnce(null); // cooldown window active

    await notifyIntegrationAlert({
      source: "plaid",
      kind: "credential",
      message: "first",
    });
    await notifyIntegrationAlert({
      source: "plaid",
      kind: "credential",
      message: "second",
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(redisSet).toHaveBeenCalledWith(
      "integration-alert-email:plaid:credential",
      "1",
      "EX",
      24 * 60 * 60,
      "NX",
    );
  });

  it("bypasses the cooldown when throttleEmail is false", async () => {
    process.env.NODE_ENV = "production";
    redisSet.mockResolvedValue(null);

    await notifyIntegrationAlert({
      source: "plaid",
      kind: "other",
      message: "always email",
      throttleEmail: false,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("swallows email send failures", async () => {
    process.env.NODE_ENV = "production";
    redisSet.mockResolvedValue("OK");
    sendEmail.mockRejectedValue(new Error("postmark down"));

    await expect(
      notifyIntegrationAlert({
        source: "plaid",
        kind: "other",
        message: "send will fail",
      }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Integration alert email send failed",
        level: "error",
      }),
    );
  });

  it("skips email when postmark has no token", async () => {
    process.env.NODE_ENV = "production";
    // Reload with hasPostmarkToken false.
    vi.resetModules();
    vi.doMock("~/server/clients/postmarkClient", () => ({
      hasPostmarkToken: false,
      postmarkClient: { sendEmail },
    }));
    const mod = await import("../integrationOpsAlert");

    await mod.notifyIntegrationAlert({
      source: "plaid",
      kind: "other",
      message: "no token",
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
