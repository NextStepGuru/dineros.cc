import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    // Suppress console output during tests
    silent: true,
    // Alternative: you can also use reporter: 'verbose' and silent: false if you want test info but not console logs
    // reporter: 'default',

    // Set up global test configuration
    setupFiles: ["./vitest.setup.ts"],

    // Parallel execution for faster tests
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
        maxForks: 4, // Adjust based on your CPU cores
        minForks: 2,
        // Memory optimization
        isolate: true,
      },
    },

    // Optimize timeouts for faster feedback
    testTimeout: 10000, // 10 seconds default
    hookTimeout: 5000, // 5 seconds for setup/teardown

    // Enable test caching for faster re-runs
    // Note: cache configuration is handled by Vite automatically

    // Optimize for speed
    globals: true,

    // Environment variables for tests
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "error", // Suppress debug/info logs
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

    // Exclude slow and problematic tests from default runs
    exclude: [
      "server/services/__tests__/HashService.test.ts",
      "server/services/__tests__/JwtService.test.ts",
      "server/services/__tests__/RsaService.test.ts",
    ],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
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
        "**/plaid*.{js,ts}", // Files starting with 'plaid'
        "**/*plaid*.{js,ts}", // Files containing 'plaid'
        "server/api/plaid-*.{js,ts}", // Plaid API endpoints
        "server/api/webhook/plaid*.{js,ts}", // Plaid webhooks
        "server/cron/plaid*.{js,ts}", // Plaid cron jobs
        "server/queues/plaid*.{js,ts}", // Plaid queue processors
        "server/services/PlaidSyncService.ts", // Plaid sync service
        "server/lib/getPlaidClient.ts", // Plaid client configuration
        "schema/plaid.ts", // Plaid schema definitions
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
        "pages/**/*.{js,ts,vue}", // Include page components
        "components/**/*.{js,ts,vue}", // Include UI components
      ],
      // Coverage thresholds (optional - will fail if below these percentages)
      thresholds: {
        global: {
          branches: 70,
          functions: 75,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
