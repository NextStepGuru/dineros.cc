import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Reoccurrences", () => {
  test("lists seeded reoccurrence", async ({ page }) => {
    await page.goto("/reoccurrences");
    await expect(page.getByText("E2E Monthly Bill")).toBeVisible({
      timeout: 45_000,
    });
  });

  test("add recurring entry button is enabled", async ({ page }) => {
    await page.goto("/reoccurrences");
    await expect(page.getByText("E2E Monthly Bill")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "Add recurring entry", exact: true }),
    ).toBeEnabled();
  });
});
