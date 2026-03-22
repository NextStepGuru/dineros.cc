import { test, expect } from "@playwright/test";

test.describe("Public navigation", () => {
  test("homepage has title and loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/dineros/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("static pages render with main headings", async ({ page }) => {
    const cases: { path: string; heading: RegExp }[] = [
      { path: "/about", heading: /about dineros/i },
      { path: "/terms-of-service", heading: /terms of service/i },
      { path: "/privacy-policy", heading: /privacy policy/i },
      { path: "/contact", heading: /contact us/i },
    ];
    for (const { path, heading } of cases) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible({
        timeout: 15_000,
      });
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
