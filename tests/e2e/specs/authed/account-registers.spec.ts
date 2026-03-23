import { test, expect } from "../../fixtures/e2e-fixtures";

test.describe("Account registers", () => {
  test("lists seeded registers", async ({ page }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("E2E Savings")).toBeVisible();
  });

  test("shows seeded balances, type labels, and net worth", async ({
    page,
  }) => {
    await page.goto("/account-registers");
    await expect(page.getByText("E2E Checking")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Checking").first()).toBeVisible();
    await expect(page.getByText("+$1,000.00").first()).toBeVisible();
    await expect(page.getByText(/\+?\$0\.00/).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /\$1,000\.00/ }),
    ).toBeVisible();
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
      .getByTestId("header-user-menu");
    await expect(signOut).toBeVisible();
    await signOut.click();
    const signOutAction = page.getByTestId("header-sign-out");
    await expect(signOutAction).toBeVisible();
    await expect(signOutAction).toBeEnabled();
  });
});
