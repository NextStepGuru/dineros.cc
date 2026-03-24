import { test, expect } from "@playwright/test";

test.describe("SEO meta tags", () => {
  test("homepage has description and canonical", async ({ page }) => {
    await page.goto("/");
    const desc = page.locator('meta[name="description"]');
    await expect(desc).toHaveAttribute("content", /.+/);
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /\/$/);
  });

  test("about page has og:title", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: /about dineros/i }),
    ).toBeVisible({ timeout: 15_000 });
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /.+/);
  });

  test("contact page has structured data", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: /contact us/i }),
    ).toBeVisible({ timeout: 15_000 });
    const jsonLd = page.locator('script[type="application/ld+json"]');
    await expect(jsonLd.first()).toBeAttached();
  });
});
