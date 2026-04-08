import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/server/env", () => ({
  default: { DEPLOY_ENV: "staging" },
}));

const { mockCreateError, mockGetHeader, mockGetRequestURL } = vi.hoisted(
  () => ({
    mockCreateError: vi.fn(
      (opts: { statusCode: number; statusMessage: string }) => {
        const e = new Error(opts.statusMessage) as Error & {
          statusCode: number;
        };
        e.statusCode = opts.statusCode;
        throw e;
      },
    ),
    mockGetHeader: vi.fn(),
    mockGetRequestURL: vi.fn(),
  }),
);

vi.mock("h3", () => ({
  createError: mockCreateError,
  getHeader: mockGetHeader,
  getRequestURL: mockGetRequestURL,
}));

// Import after mocks (Vitest); module under test must see mocked h3/env.
// eslint-disable-next-line import/first -- mocks must be registered first
import { assertE2EAllowed } from "~/server/api/e2e/_guard";

describe("assertE2EAllowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.E2E_SEED_TOKEN = "expected-e2e-token";
  });

  it("throws 403 when x-e2e-token mismatches (timing-safe path)", async () => {
    mockGetHeader.mockImplementation((_e: unknown, name: string) =>
      name === "x-e2e-token" ? "wrong-token-value" : undefined,
    );

    expect(() => assertE2EAllowed({} as never)).toThrow("Forbidden");
  });
});
