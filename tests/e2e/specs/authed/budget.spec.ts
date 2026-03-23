import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Budget switcher", () => {
  test("budget button is visible with seeded budget name", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("banner").getByTestId("header-user-menu"),
    ).toBeVisible();
    await expect(page.getByRole("banner").getByTestId("header-user-menu")).toHaveAttribute(
      "aria-label",
      /E2E Budget/i,
    );
  });

  test("budget trigger is clickable", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    const trigger = page.getByRole("banner").getByTestId("header-user-menu");
    await expect(trigger).toBeEnabled();
    await trigger.click();
    await expect(page.getByText("Budget")).toBeVisible();
    await expect(page.getByText("E2E Budget")).toBeVisible();
  });
});
