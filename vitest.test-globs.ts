// Shared Vitest include/exclude globs for the **node** project (fast, no Nuxt app bootstrap).
//
// Audit — what belongs where:
// - **node** (below): API handlers tested with mocks, server services/lib/middleware, lib, pages unit,
//   schema, prisma reencrypt, stores with mocked Nuxt/Pinia as needed, `tests/**` except Nuxt paths.
// - **nuxt** (vitest.config.ts `defineVitestProject`): `tests/nuxt/**`, `**/*.nuxt.{test,spec}.ts` —
//   composables/pages/plugins that need `useNuxtApp`, auto-imports, or full Nuxt pipeline.
// - **Playwright**: e2e only (`test:e2e`), not Vitest.
//
// Nuxt-runtime tests live outside these includes or are excluded from node via `vitestNodeProjectExcludes`.
export const vitestNodeTestIncludes = [
  "server/api/__tests__/**/*.test.ts",
  "server/services/__tests__/**/*.test.ts",
  "server/services/forecast/__tests__/**/*.test.ts",
  "server/services/reports/__tests__/**/*.test.ts",
  "server/lib/__tests__/**/*.test.ts",
  "server/middleware/__tests__/**/*.test.ts",
  "lib/__tests__/**/*.test.ts",
  "pages/__tests__/**/*.test.ts",
  "tests/**/*.test.ts",
  "schema/__tests__/**/*.test.ts",
  "prisma/reencrypt/__tests__/**/*.test.ts",
  "stores/__tests__/**/*.test.ts",
] as const;

export const vitestSlowTestExcludes = [
  "server/services/__tests__/HashService.test.ts",
  "server/services/__tests__/JwtService.test.ts",
  "server/services/__tests__/RsaService.test.ts",
] as const;

/** Node project must not run Nuxt-runtime tests (overlap with tests/ and tests/nuxt globs). */
export const vitestNodeProjectExcludes = [
  ...vitestSlowTestExcludes,
  "tests/nuxt/**",
  "**/*.nuxt.{test,spec}.ts",
] as const;
