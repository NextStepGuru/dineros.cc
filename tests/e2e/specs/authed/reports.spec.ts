import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Reports", () => {
  test("page loads", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("body")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /category reports/i }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
