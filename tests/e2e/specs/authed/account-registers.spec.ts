import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Account registers", () => {
  test("lists seeded registers", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("E2E Savings")).toBeVisible();
  });

  test("add account button is enabled", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "Add account", exact: true }),
    ).toBeEnabled();
  });
});

test.describe("Logout (authed)", () => {
  test("sign out button is visible and clickable", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    const signOut = page
      .getByRole("banner")
      .getByRole("button", { name: /^sign out$/i });
    await expect(signOut).toBeVisible();
    await expect(signOut).toBeEnabled();
  });
});
