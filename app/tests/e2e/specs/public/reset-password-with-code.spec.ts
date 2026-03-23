import { test, expect } from "@playwright/test";

test.describe("Reset password with code (unauthenticated)", () => {
  test("form displays", async ({ page }) => {
    await page.goto("/reset-password-with-code");
    await expect(
      page.getByRole("heading", { name: /set a new password/i }),
    ).toBeVisible();
    await expect(page.locator("#resetCode")).toBeVisible();
    await expect(page.locator("#newPassword")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /update password/i }),
    ).toBeVisible();
  });
});
