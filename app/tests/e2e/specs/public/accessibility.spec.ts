import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/contact",
  "/privacy-policy",
  "/terms-of-service",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password-with-code",
] as const;

test.describe("Accessibility — public pages", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no axe-core violations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

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
});
