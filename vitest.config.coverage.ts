import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    // Suppress console output during tests
    silent: true,

    // Set up global test configuration
    setupFiles: ["./vitest.setup.ts"],

    // Parallel execution for faster tests
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
        maxForks: 4,
        minForks: 2,
        isolate: true,
      },
    },

    // Optimize timeouts for faster feedback
    testTimeout: 10000,
    hookTimeout: 5000,

    // Optimize for speed
    globals: true,

    // Environment variables for tests
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "error",
    },

    // Test patterns to include
    include: [
      "server/api/__tests__/**/*.test.ts",
      "server/services/__tests__/**/*.test.ts",
      "server/services/forecast/__tests__/**/*.test.ts",
      "server/lib/__tests__/**/*.test.ts",
      "lib/__tests__/**/*.test.ts",
      "pages/__tests__/**/*.test.ts",
      "tests/**/*.test.ts",
    ],

    // Exclude slow tests from coverage runs
    exclude: [
      "server/services/__tests__/HashService.test.ts",
      "server/services/__tests__/JwtService.test.ts",
      "server/services/__tests__/RsaService.test.ts",
    ],

    // Enhanced coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "html", "lcov", "cobertura"],
      reportsDirectory: "./coverage",
      exclude: [
        "coverage/**",
        "dist/**",
        "**/node_modules/**",
        "**/.{git,cache,output,temp}/**",
        "**/__tests__/**",
        "**/*.test.{js,ts}",
        "**/*.config.{js,ts}",
        "**/build/**",
        "**/.nuxt/**",
        "**/.output/**",
        "**/prisma/migrations/**",
        "**/public/**",
        "**/assets/**",
        "scripts/**",
        "vitest.setup.ts",
        "app.vue",
        "nuxt.config.ts",
        "app.config.ts",
        "eslint.config.mjs",
        // Exclude all Plaid-related files
        "**/plaid*.{js,ts}",
        "**/*plaid*.{js,ts}",
        "server/api/plaid-*.{js,ts}",
        "server/api/webhook/plaid*.{js,ts}",
        "server/cron/plaid*.{js,ts}",
        "server/queues/plaid*.{js,ts}",
        "server/services/PlaidSyncService.ts",
        "server/lib/getPlaidClient.ts",
        "schema/plaid.ts",
      ],
      include: [
        "server/**/*.{js,ts}",
        "lib/**/*.{js,ts}",
        "composables/**/*.{js,ts}",
        "middleware/**/*.{js,ts}",
        "plugins/**/*.{js,ts}",
        "stores/**/*.{js,ts}",
        "types/**/*.{js,ts}",
        "schema/**/*.{js,ts}",
        "pages/**/*.{js,ts,vue}",
        "components/**/*.{js,ts,vue}",
      ],
      // Coverage thresholds
      thresholds: {
        global: {
          branches: 70,
          functions: 75,
          lines: 80,
          statements: 80,
        },
      },
      // Additional coverage options
      all: true,
      clean: true,
      cleanOnRerun: true,
      skipFull: false,
      watermarks: {
        statements: [80, 95],
        branches: [80, 95],
        functions: [80, 95],
        lines: [80, 95],
      },
    },
  },
});
