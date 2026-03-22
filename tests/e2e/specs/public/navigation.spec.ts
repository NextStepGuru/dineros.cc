import { test, expect } from "@playwright/test";

test.describe("Public navigation", () => {
  test("homepage has title and loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/dineros/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("static pages render", async ({ page }) => {
    for (const path of [
      "/about",
      "/terms-of-service",
      "/privacy-policy",
      "/contact",
    ]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("unknown path shows error page", async ({ page }) => {
    await page.goto("/this-route-should-not-exist-12345");
    await expect(
      page.getByText(/page not found|we hit a snag|snag/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("viewport meta tag", async ({ page }) => {
    await page.goto("/");
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute("content", /width=device-width/);
  });
});
