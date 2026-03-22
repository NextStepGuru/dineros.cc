import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Savings goals", () => {
  test("lists seeded goal", async ({ page }) => {
    await page.goto("/goals");
    await expect(page.getByText("E2E Emergency Fund")).toBeVisible({
      timeout: 45_000,
    });
  });

  test("add goal button is enabled", async ({ page }) => {
    await page.goto("/goals");
    await expect(page.getByText("E2E Emergency Fund")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "Add goal", exact: true }),
    ).toBeEnabled();
  });
});
