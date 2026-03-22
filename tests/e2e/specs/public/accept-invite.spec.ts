import { test, expect } from "@playwright/test";

test.describe("Accept invite (unauthenticated)", () => {
  test("missing token shows guidance", async ({ page }) => {
    await page.goto("/accept-invite");
    await expect(
      page.getByText(/missing invite link/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("invalid token redirects or shows error", async ({ page }) => {
    await page.goto("/accept-invite?token=not-a-real-token");
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const errorText = page.getByText(
      /invalid or has expired|could not load invitation|missing invite link/i,
    ).first();
    const onLogin = page.getByRole("heading", { name: /welcome back|sign in/i });
    await expect(errorText.or(onLogin)).toBeVisible({ timeout: 15_000 });
  });
});
