import { describe, it, expect } from "vitest";

describe("Simple Debug Test", () => {
  it("should work", async () => {
    // Simple async operation
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(true).toBe(true);
  });
});
