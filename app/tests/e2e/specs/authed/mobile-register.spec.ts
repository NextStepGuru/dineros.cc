import { test, expect } from "../../fixtures/e2e-fixtures";

/**
 * iPhone 13 Pro Max class viewport (430×932). The app header + the register page's
 * sticky toolbar used to pin ~300px of chrome over the table, hiding the top entries;
 * these tests pin the compact mobile chrome so it cannot regress.
 */
test.describe("Register mobile sticky chrome", () => {
  // Only meaningful where the compact mobile chrome applies. Desktop projects (≥768px
  // viewport) skip; mobile projects run with the pinned viewport set inside each test.
  test.skip(({ viewport }) => !!viewport && viewport.width >= 768, "mobile-only");

  const IPHONE_13_PRO_MAX = { width: 430, height: 932 };

  test("app header is slim on mobile", async ({ page }) => {
    await page.setViewportSize(IPHONE_13_PRO_MAX);
    await page.goto("/account-registers");
    const header = page.locator("header.app-header-bar");
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    // --ui-header-height is 3.25rem (52px) below 40rem; allow the border pixel.
    expect(box?.height ?? 999).toBeLessThanOrEqual(56);
  });

  test("sticky register toolbar stays compact and entries stay reachable", async ({
    page,
    e2e,
  }) => {
    await page.setViewportSize(IPHONE_13_PRO_MAX);

    // Seed enough future entries via the API to make the register table scroll
    // (the auth cookie is shared with the page context).
    for (let i = 1; i <= 40; i++) {
      const res = await page.request.post("/api/register-entry", {
        data: {
          accountRegisterId: e2e.checkingRegisterId,
          description: `Mobile scroll entry ${i}`,
          amount: i % 2 === 0 ? 12.34 : 7.89,
          balance: 0,
          createdAt: new Date(Date.now() + i * 86_400_000).toISOString(),
          isPending: true,
        },
      });
      if (!res.ok()) {
        throw new Error(`Seeding entry ${i} failed: ${res.status()}`);
      }
    }

    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });

    const stickyTh = page.locator(".register-thead-sticky-th");
    await expect(stickyTh).toBeVisible();
    const box = await stickyTh.boundingBox();
    // Desktop layout wraps this head to ~250px+ on narrow screens; mobile must stay ~2 rows.
    expect(box?.height ?? 999).toBeLessThan(175);

    // Secondary actions live in the overflow menu instead of wrapping the toolbar.
    await page.getByRole("button", { name: /more register actions/i }).click();
    await expect(
      page.getByRole("menuitem", { name: /recalculate forecast/i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // At the top of the list the first entry row must sit below the pinned chrome.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const stickyBox = await stickyTh.boundingBox();
    const firstRow = page.locator(".register-main-table tbody tr").first();
    const rowBox = await firstRow.boundingBox();
    expect(rowBox?.y ?? -999).toBeGreaterThanOrEqual(
      (stickyBox?.y ?? 0) + (stickyBox?.height ?? 0) - 1,
    );

    // Scrolling into the list collapses the account/hint block: pinned chrome shrinks.
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect(stickyTh.locator(".register-head-meta")).toHaveClass(
      /register-head-meta-collapsed/,
      { timeout: 5_000 },
    );
    const collapsedBox = await stickyTh.boundingBox();
    expect(collapsedBox?.height ?? 999).toBeLessThan(box?.height ?? 999);
  });
});
