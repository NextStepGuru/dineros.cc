import { test, expect } from "@playwright/test";
import { createTestHelpers } from "../../utils/test-helpers";

test.describe("Auth pages (unauthenticated)", () => {
  test("login form displays", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("invalid credentials show feedback", async ({ page }) => {
    const helpers = createTestHelpers(page);
    await helpers.navigateTo("/login");
    await helpers.fillLoginForm("not-a-real-user@dineros.cc", "wrong-password");
    await helpers.submitLoginForm();
    await expect(
      page.getByText("Invalid email or password.", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("signup page shows account fields", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
  });

  test("signup page stays on validation for empty submit", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("forgot password page shows recover form", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(
      page.getByRole("heading", { name: /recover your account/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send reset code/i }),
    ).toBeVisible();
  });

  test("protected routes redirect to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/account-registers");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/goals");
    await expect(page).toHaveURL(/\/login/);
  });
});
