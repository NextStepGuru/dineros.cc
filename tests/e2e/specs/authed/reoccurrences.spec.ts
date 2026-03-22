import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Reoccurrences", () => {
  test("lists seeded reoccurrence", async ({ page }) => {
    await page.goto("/reoccurrences");
    await expect(page.getByText("E2E Monthly Bill")).toBeVisible({
      timeout: 45_000,
    });
  });
});
