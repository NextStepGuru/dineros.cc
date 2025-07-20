import { vi } from "vitest";

// Mock console methods to suppress debug output during tests
const originalConsole = { ...console };

// Suppress console.log, console.debug, and console.info during tests
// Keep console.error and console.warn for actual test failures
global.console = {
  ...originalConsole,
  log: vi.fn(), // Mock console.log to suppress debug output
  debug: vi.fn(), // Mock console.debug
  info: vi.fn(), // Mock console.info
  // Keep error and warn for test debugging
  error: originalConsole.error,
  warn: originalConsole.warn,
};

// Set environment for tests
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";

// Log that queues and cron jobs are disabled for tests
console.log("🧪 Test environment: Queues and cron jobs disabled for testing");

// Required environment variables for server/env.ts validation
process.env.DB_ENCRYPTION_KEY =
  "test-encryption-key-12345678901234567890123456789012";
process.env.DB_DECRYPTION_KEY_1 =
  "test-decryption-key-12345678901234567890123456789012";
process.env.PLAID_CLIENT_ID = "test-plaid-client-id";
process.env.PLAID_SECRET = "test-plaid-secret";
process.env.POSTMARK_SERVER_TOKEN = "test-postmark-token";
process.env.JWT_SECRET = "test-jwt-secret-key";
process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "6379";
process.env.NATS_URL = "nats://localhost:4222";
process.env.NUXT_UI_PRO_LICENSE = "test-license-key";
process.env.DEPLOY_ENV = "local";

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

// Optimize test isolation - these will be called automatically by Vitest
// beforeEach(() => {
//   vi.clearAllMocks();
//   vi.clearAllTimers();
// });

// afterEach(() => {
//   vi.restoreAllMocks();
// });

// Mock Nuxt utilities
vi.mock("#imports", () => ({}));

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

// Optional: Restore console for specific tests if needed
export const restoreConsole = () => {
  global.console = originalConsole;
};

export const mockConsole = () => {
  global.console = {
    ...originalConsole,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: originalConsole.error,
    warn: originalConsole.warn,
  };
};
