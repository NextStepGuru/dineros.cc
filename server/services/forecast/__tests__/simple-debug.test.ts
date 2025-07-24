import { describe, it, expect } from "vitest";

describe("Simple Debug Test", () => {
  it("should work", async () => {
    console.log("=== SIMPLE DEBUG TEST START ===");

    // Simple async operation
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log("Async operation completed");

    expect(true).toBe(true);

    console.log("=== SIMPLE DEBUG TEST END ===");
  });
});
