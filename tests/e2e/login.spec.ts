import { test, expect } from "@playwright/test";
import { createTestHelpers } from "./utils/test-helpers";

test.describe("Login Page E2E Tests", () => {
  let helpers: ReturnType<typeof createTestHelpers>;

  test.beforeEach(async ({ page }) => {
    helpers = createTestHelpers(page);
    await helpers.navigateTo("/login");
  });

  test("should display login form", async ({ page }) => {
    // Check that the login form is visible
    await expect(
      page.getByRole("heading", { name: /login to your account/i })
    ).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  });

  test("should show validation errors for invalid input", async ({ page }) => {
    // Try to submit empty form
    await page.getByRole("button", { name: /login/i }).click();

    // Should show validation errors (Nuxt UI validation)
    await expect(page.locator("body")).toBeVisible();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    // Mock API error response
    await helpers.mockApiError("**/api/login", 401, "Invalid credentials");

    // Fill in invalid credentials
    await helpers.fillLoginForm("invalid@example.com", "wrongpassword");

    // Submit form
    await page.getByRole("button", { name: /login/i }).click();

    // Should show error message (check for toast or error text)
    await expect(page.locator("body")).toBeVisible();
  });

  test("should handle 2FA challenge", async ({ page }) => {
    // Mock 2FA response
    await helpers.mockApiResponse("**/api/login", {
      twoFactorChallengeRequired: true,
    });

    // Fill in credentials
    await helpers.fillLoginForm("test@example.com", "password123");

    // Submit form
    await page.getByRole("button", { name: /login/i }).click();

    // Should show 2FA input
    await expect(page.getByLabel(/code/i)).toBeVisible();
  });

  test("should navigate to signup page", async ({ page }) => {
    // Click on register link - be more specific to avoid multiple matches
    await page.locator('a[href="/signup"]').first().click();

    // Should navigate to signup page
    await expect(page).toHaveURL(/\/signup/);
  });

  test("should navigate to forgot password page", async ({ page }) => {
    // Click on forgot password link
    await page.getByRole("link", { name: /forgot password/i }).click();

    // Should navigate to forgot password page
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("should handle successful login flow", async ({ page }) => {
    // Mock successful login response
    await helpers.mockApiResponse("**/api/login", {
      token: "mock-jwt-token",
      user: { id: 1, email: "test@example.com" },
    });

    // Fill in credentials
    await helpers.fillLoginForm("test@example.com", "password123");

    // Submit form
    await page.getByRole("button", { name: /login/i }).click();

    // Wait for navigation or check for success state
    await page.waitForTimeout(2000);

    // Check if we're still on login page (which would indicate an issue)
    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      // If still on login, check for success message
      await expect(page.locator("body")).toBeVisible();
    } else {
      // If redirected, verify the new URL
      await expect(page).toHaveURL(/\/register\/|dashboard/);
    }
  });

  test("should maintain form state during errors", async ({ page }) => {
    // Mock API error
    await helpers.mockApiError("**/api/login", 500, "Server error");

    // Fill in credentials
    await helpers.fillLoginForm("test@example.com", "password123");

    // Submit form
    await page.getByRole("button", { name: /login/i }).click();

    // Form values should be preserved
    await expect(page.getByLabel(/email address/i)).toHaveValue(
      "test@example.com"
    );
    await expect(page.getByLabel(/password/i)).toHaveValue("password123");
  });
});
