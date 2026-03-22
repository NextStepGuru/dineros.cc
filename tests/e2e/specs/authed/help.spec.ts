import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Help (authed)", () => {
  test("help page loads with main content", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: /^help$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("#recent-updates")).toBeVisible();
  });
});
