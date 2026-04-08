import { describe, it, expect, vi, afterEach } from "vitest";

const { mockCreateError } = vi.hoisted(() => ({
  mockCreateError: vi.fn(
    (opts: { statusCode?: number; statusMessage?: string }) => {
      const e = new Error(opts.statusMessage ?? "err") as Error & {
        statusCode?: number;
      };
      e.statusCode = opts.statusCode;
      throw e;
    },
  ),
}));

vi.mock("h3", () => ({
  createError: mockCreateError,
}));
vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/services/poolTimeoutHealthService", () => ({
  poolTimeoutHealthService: { record: vi.fn() },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import { handleApiError } from "~/server/lib/handleApiError";

describe("handleApiError", () => {
  const prev = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prev;
    vi.clearAllMocks();
  });

  it("uses generic message in production for generic Error", () => {
    process.env.NODE_ENV = "production";
    expect(() => handleApiError(new Error("secret detail"))).toThrow(
      "Something went wrong",
    );
  });

  it("uses error.message in non-production", () => {
    process.env.NODE_ENV = "test";
    expect(() => handleApiError(new Error("visible detail"))).toThrow(
      "visible detail",
    );
  });
});
