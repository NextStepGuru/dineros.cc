import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Budget switcher", () => {
  test("budget button is visible with seeded budget name", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("banner").getByRole("button", { name: /E2E Budget/i }),
    ).toBeVisible();
  });

  test("budget trigger is clickable", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    const trigger = page
      .getByRole("banner")
      .getByRole("button", { name: /E2E Budget/i });
    await expect(trigger).toBeEnabled();
  });
});
