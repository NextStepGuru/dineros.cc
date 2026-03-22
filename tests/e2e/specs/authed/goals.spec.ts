import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Savings goals", () => {
  test("lists seeded goal", async ({ page }) => {
    await page.goto("/goals");
    await expect(page.getByText("E2E Emergency Fund")).toBeVisible({
      timeout: 45_000,
    });
  });

  test("shows target amount and source/target registers", async ({ page }) => {
    await page.goto("/goals");
    await expect(page.getByText("E2E Emergency Fund")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("$500.00").first()).toBeVisible();
    await expect(page.getByText("E2E Checking")).toBeVisible();
    await expect(page.getByText("E2E Savings")).toBeVisible();
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
