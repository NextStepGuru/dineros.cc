import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: unknown) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler: unknown) => handler),
  setResponseStatus: vi.fn(),
  createError: vi.fn((error: any) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const err = new Error(`HTTP ${statusCode}: ${message}`) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import nuxtStub from "../_nuxt.get";
// eslint-disable-next-line import/first -- mocks must be registered first
import { setResponseStatus } from "h3";

describe("GET /_nuxt stub route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responds 204 with no body", () => {
    const event = {};

    const result = nuxtStub(event);

    expect(setResponseStatus).toHaveBeenCalledWith(event, 204);
    expect(result).toBeNull();
  });
});
