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

  test("login page links to signup and forgot password", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
    await expect(page.locator('a[href="/forgot-password"]').first()).toBeVisible();
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

  test("signup form has all required fields", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create account/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /sign in/i }),
    ).toBeVisible();
  });

  test("protected routes redirect to login when unauthenticated", async ({
    page,
  }) => {
    const protectedPaths = [
      "/account-registers",
      "/goals",
      "/reoccurrences",
      "/reports",
      "/help",
      "/edit-profile/profile",
      "/register/1",
    ];
    for (const path of protectedPaths) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

test.describe("Signup form validation", () => {
  test("mismatched passwords show error", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();

    await page.getByLabel(/first name/i).fill("Test");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/email address/i).fill("signup-test@example.com");
    await page.getByLabel(/^password$/i).fill("validPass1");
    await page.getByLabel(/confirm password/i).fill("differentPass2");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByText(/passwords do not match/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("too-short password shows error", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();

    await page.getByLabel(/first name/i).fill("Test");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/email address/i).fill("signup-test@example.com");
    await page.getByLabel(/^password$/i).fill("ab");
    await page.getByLabel(/confirm password/i).fill("ab");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByText(/at least 6 characters/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("duplicate email shows server-side error", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();

    await page.getByLabel(/first name/i).fill("Test");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/email address/i).fill("e2e-test@dineros.cc");
    await page.getByLabel(/^password$/i).fill("validPass123");
    await page.getByLabel(/confirm password/i).fill("validPass123");
    await page.getByRole("button", { name: /create account/i }).click();

    const errorOrStay = page
      .getByText(/already exists|already registered|already in use|error/i)
      .first()
      .or(page.getByRole("alert").first());
    await expect(errorOrStay).toBeVisible({ timeout: 15_000 });
  });

  test("forgot password with nonexistent email does not crash", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await expect(
      page.getByRole("heading", { name: /recover your account/i }),
    ).toBeVisible();

    await page.getByLabel(/email address/i).fill("nonexistent@example.com");
    await page.getByRole("button", { name: /send reset code/i }).click();

    await page.waitForTimeout(3_000);
    await expect(page.locator("body")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /recover your account/i }),
    ).toBeVisible();
  });
});
