import { vi } from "vitest";

// Mock Nuxt utilities (defineStore so store modules can load in tests)
import { defineStore } from "pinia";

// Set environment for tests
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
// Matches CI (.github/workflows/pr.yml); avoids import-order crashes if prismaClient loads before vi.mock
process.env.DATABASE_URL ??= "mysql://ci:ci@localhost:3306/ci";

// server/env + prisma-field-encryption require Cloak-serialized keys (see build-test.sh)
const ciCloakKey = "k1.aesgcm256.yQcdOV0BPCyRNiFasjXX5kqelCifs2jpp70GbLrao4c=";
process.env.DB_ENCRYPTION_KEY = ciCloakKey;
process.env.DB_DECRYPTION_KEY_1 = ciCloakKey;
process.env.PLAID_CLIENT_ID = "test-plaid-client-id";
process.env.PLAID_SECRET = "test-plaid-secret";
process.env.POSTMARK_SERVER_TOKEN = "test-postmark-token";
process.env.JWT_SECRET = "test-jwt-secret-key";
process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "6379";
process.env.NATS_URL = "nats://localhost:4222";
process.env.DEPLOY_ENV = "local";
process.env.TEST_DATE = "2024-01-01T00:00:00.000Z";
process.env.TEST_TIMEZONE = "UTC";
process.env.RUN_EDGE_CASE_TESTS = "true";
process.env.RUN_SLOW_TESTS = "true";

// Mock H3/Nuxt utilities - optimized for speed
const h3Mocks = {
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const fullMessage = `HTTP ${statusCode}: ${message}`;
    const err = new Error(fullMessage) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  getQuery: vi.fn(),
  readBody: vi.fn(),
  readMultipartFormData: vi.fn(),
  setHeader: vi.fn(),
  appendHeader: vi.fn(),
  getHeader: vi.fn(),
  getHeaders: vi.fn(),
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getRouterParam: vi.fn(),
  getRouterParams: vi.fn(),
  isMethod: vi.fn(),
  assertMethod: vi.fn(),
  getMethod: vi.fn(),
  getRequestURL: vi.fn(),
  getRequestIP: vi.fn(),
};

vi.mock("h3", () => h3Mocks);
vi.mock("#imports", () => ({ defineStore }));

// Prevent BullMQ from connecting to Redis in any test (e.g. queueManager.test toggles NODE_ENV)
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "mock-job-id", name: "", data: {} }),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock crypto module for RSA service tests
vi.mock("crypto", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    default: actual.default || actual, // Ensure default export exists
    generateKeyPairSync: vi.fn(() => ({
      publicKey: "mock-public-key",
      privateKey: "mock-private-key",
    })),
    createSign: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      sign: vi.fn(() => "mock-signature"),
    })),
    createVerify: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      verify: vi.fn(() => true),
    })),
  };
});

// Utility to capture stderr during tests
export const captureStderr = (fn: () => void | Promise<void>): string => {
  const originalStderr = process.stderr.write;
  const originalConsoleError = console.error;
  const chunks: Buffer[] = [];

  // Intercept process.stderr.write
  process.stderr.write = (chunk: any, ...args: any[]) => {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    }
    return originalStderr.call(process.stderr, chunk, ...args);
  };

  // Intercept console.error
  console.error = (...args: any[]) => {
    const message =
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ") + "\n";
    chunks.push(Buffer.from(message));
    return originalConsoleError.apply(console, args);
  };

  try {
    fn();
  } finally {
    process.stderr.write = originalStderr;
    console.error = originalConsoleError;
  }

  return Buffer.concat(chunks).toString("utf8");
};

// Async version for async functions
export const captureStderrAsync = async (
  fn: () => Promise<void>,
): Promise<string> => {
  const originalStderr = process.stderr.write;
  const originalConsoleError = console.error;
  const chunks: Buffer[] = [];

  // Intercept process.stderr.write
  process.stderr.write = (chunk: any, ...args: any[]) => {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    }
    return originalStderr.call(process.stderr, chunk, ...args);
  };

  // Intercept console.error
  console.error = (...args: any[]) => {
    const message =
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ") + "\n";
    chunks.push(Buffer.from(message));
    return originalConsoleError.apply(console, args);
  };

  try {
    await fn();
  } finally {
    process.stderr.write = originalStderr;
    console.error = originalConsoleError;
  }

  return Buffer.concat(chunks).toString("utf8");
};
