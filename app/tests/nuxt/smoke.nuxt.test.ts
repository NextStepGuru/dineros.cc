import { describe, it, expect } from "vitest";

/**
 * Smoke test for the Vitest **nuxt** project (Nuxt runtime).
 * Prefer `*.nuxt.test.ts` or `tests/nuxt/**` for composables/components that need auto-imports.
 */
describe("nuxt vitest environment", () => {
  it("exposes nuxt test runtime", () => {
    expect(import.meta.env).toBeDefined();
  });
});
