import { test, expect } from "@playwright/test";

function isLocalBaseUrl(baseURL?: string): boolean {
  if (!baseURL) return true;
  try {
    const url = new URL(baseURL);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return true;
  }
}

test.describe("Public navigation", () => {
  test("homepage has title and loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/dineros/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("homepage CTA and features section", async ({ page }) => {
    await page.goto("/");
    const signInCta = page.getByRole("link", { name: /start with sign in/i });
    await expect(signInCta).toBeVisible();
    await expect(signInCta).toHaveAttribute("href", "/login");
    await expect(page.locator("#features")).toBeVisible();
  });

  test("footer has About, Contact, Terms, Privacy", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer").first();
    await expect(footer).toBeVisible();
    await expect(footer.getByRole("link", { name: /^about$/i })).toBeVisible();
    await expect(footer.getByRole("link", { name: /^contact$/i })).toBeVisible();
    await expect(footer.getByRole("link", { name: /^terms$/i })).toBeVisible();
    await expect(footer.getByRole("link", { name: /^privacy$/i })).toBeVisible();
  });

  test("skip-to-main link exists", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="#main-content"]')).toHaveCount(1);
  });

  test("local development banner when deploy env is local", async ({
    page,
  }) => {
    await page.goto("/");
    const banner = page.locator("output").filter({ hasText: /local development/i });
    if (isLocalBaseUrl(test.info().project.use.baseURL)) {
      await expect(banner).toBeVisible();
      return;
    }
    await expect(banner).toHaveCount(0);
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

  test("unknown path shows error page with recovery", async ({ page }) => {
    await page.goto("/this-route-should-not-exist-12345");
    await expect(
      page.getByText(/page not found|we hit a snag|snag/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    const goHome = page.getByRole("button", { name: /^go home$/i });
    const goLogin = page.getByRole("button", { name: /^go to login$/i });
    await expect(goHome).toBeVisible();
    await expect(goLogin).toBeVisible();
    await expect(goHome).toBeEnabled();
    await expect(goLogin).toBeEnabled();
  });

  test("about page has author and structured content", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: /about dineros/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[itemprop="headline"]')).toBeVisible();
    await expect(page.getByText("Dineros Editorial Team")).toBeVisible();
  });

  test("privacy policy has California anchor section", async ({ page }) => {
    await page.goto("/privacy-policy");
    await expect(
      page.getByRole("heading", { name: /privacy policy/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#california-privacy-rights")).toBeVisible();
  });

  test("viewport meta tag", async ({ page }) => {
    await page.goto("/");
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute("content", /width=device-width/);
  });
});
