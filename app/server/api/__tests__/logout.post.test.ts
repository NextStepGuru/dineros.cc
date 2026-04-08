import { describe, it, expect, vi, beforeEach } from "vitest";

const deleteCookie = vi.fn();

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = (fn: (_e: unknown) => unknown) =>
    fn;
});

vi.mock("h3", () => ({
  defineEventHandler: (fn: (_e: unknown) => unknown) => fn,
  deleteCookie,
}));

describe("POST /api/logout", () => {
  let handler: (_event: Record<string, unknown>) => unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../logout.post");
    handler = mod.default as typeof handler;
  });

  it("deletes authToken cookie with path /", () => {
    const event = {};
    const out = handler(event);
    expect(out).toEqual({ ok: true });
    expect(deleteCookie).toHaveBeenCalledWith(event, "authToken", {
      path: "/",
    });
  });
});
