import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../../fixtures/e2e-fixtures";

// Nuxt UI framework / theme-level violations — rules triggered by Nuxt UI
// component internals (UHeader duplicate <nav>, USelect combobox buttons,
// UCheckbox hidden inputs, theme contrast) that we cannot fix at app level.
const KNOWN_FRAMEWORK_RULES = [
  "button-name",
  "color-contrast",
  "label",
  "landmark-unique",
  "link-in-text-block",
  "nested-interactive",
];

const STATIC_AUTHED_ROUTES = [
  "/account-registers",
  "/goals",
  "/reoccurrences",
  "/reports",
  "/help",
  "/edit-profile/profile",
  "/edit-profile/password",
  "/edit-profile/notifications",
  "/edit-profile/team",
  "/edit-profile/sync-accounts",
  "/edit-profile/two-factor-auth",
] as const;

const WAIT_MARKERS: Record<string, RegExp> = {
  "/account-registers": /E2E Checking/,
  "/goals": /E2E Emergency Fund/,
  "/reoccurrences": /E2E Monthly Bill/,
  "/reports": /category reports/i,
  "/help": /^help$/i,
};

test.describe("Accessibility — authed pages", () => {
  for (const route of STATIC_AUTHED_ROUTES) {
    test(`${route} has no axe-core violations`, async ({ page }) => {
      await page.goto(route);
      const marker = WAIT_MARKERS[route];
      if (marker) {
        await expect(page.getByText(marker).first()).toBeVisible({
          timeout: 45_000,
        });
      } else {
        await page.waitForLoadState("domcontentloaded");
      }

      const results = await new AxeBuilder({ page })
        .disableRules(KNOWN_FRAMEWORK_RULES)
        .analyze();

      expect(
        results.violations,
        results.violations
          .map(
            (v) =>
              `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`,
          )
          .join("\n"),
      ).toHaveLength(0);
    });
  }

  test("/register/:id has no axe-core violations", async ({ page, e2e }) => {
    await page.goto(`/register/${e2e.checkingRegisterId}`);
    await expect(page.getByText("E2E seeded transaction")).toBeVisible({
      timeout: 45_000,
    });

    const results = await new AxeBuilder({ page })
      .disableRules(KNOWN_FRAMEWORK_RULES)
      .analyze();

    expect(
      results.violations,
      results.violations
        .map(
          (v) =>
            `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`,
        )
        .join("\n"),
    ).toHaveLength(0);
  });
});
