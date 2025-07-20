import { test, expect } from "@playwright/test";

test.describe("Navigation E2E Tests", () => {
  test("should load homepage", async ({ page }) => {
    await page.goto("/");

    // Check that the page loads without errors
    await expect(page).toHaveTitle(/dineros/i);

    // Check for basic page structure
    await expect(page.locator("body")).toBeVisible();
  });

  test("should navigate between main pages", async ({ page }) => {
    // Test navigation to login page
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);

    // Test navigation to signup page
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/signup/);

    // Test navigation to forgot password page
    await page.goto("/forgot-password");
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("should handle 404 pages gracefully", async ({ page }) => {
    // Navigate to a non-existent page
    await page.goto("/non-existent-page");

    // Should show 404 or error page
    await expect(page.locator("body")).toBeVisible();
  });

  test("should have proper meta tags", async ({ page }) => {
    await page.goto("/");

    // Check for viewport meta tag
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute("content", /width=device-width/);
  });
});
