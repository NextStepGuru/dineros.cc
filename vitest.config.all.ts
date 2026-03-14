import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // Suppress console output during tests
    silent: false,

    // Capture stderr output
    reporters: ["verbose"],
    onConsoleLog(log, type) {
      // Capture stderr logs
    },

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
    testTimeout: 30000, // Add global timeout of 30 seconds
    hookTimeout: 5000,

    // Enable test caching for faster re-runs
    // Note: cache configuration is handled by Vite automatically

    // Optimize for speed
    globals: true,

    // Force Node.js environment only
    environment: "node",

    // Environment variables for tests
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "error", // Suppress debug/info logs
    },

    // Test patterns to include ALL tests
    include: [
      "server/api/__tests__/**/*.test.ts",
      "server/services/__tests__/**/*.test.ts",
      "server/services/forecast/__tests__/**/*.test.ts",
      "server/lib/__tests__/**/*.test.ts",
      "server/middleware/__tests__/**/*.test.ts",
      "lib/__tests__/**/*.test.ts",
      "schema/__tests__/**/*.test.ts",
      "stores/__tests__/**/*.test.ts",
      "pages/__tests__/**/*.test.ts",
      "tests/**/*.test.ts",
    ],

    // NO exclusions - run all tests

    // Coverage (used when --coverage is passed, e.g. pnpm test:coverage)
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "html", "lcov"],
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
      // Baseline from initial coverage run; raise as new tests are added
      thresholds: {
        global: {
          branches: 80,
          functions: 65,
          lines: 38,
          statements: 38,
        },
      },
    },
  },

  resolve: {
    alias: {
      "~": resolve(__dirname, "."),
      "~/server": resolve(__dirname, "server"),
      "~/lib": resolve(__dirname, "lib"),
      "~/types": resolve(__dirname, "types"),
      "~/schema": resolve(__dirname, "schema"),
      "~/stores": resolve(__dirname, "stores"),
      "~/composables": resolve(__dirname, "composables"),
      "~/components": resolve(__dirname, "components"),
      "~/pages": resolve(__dirname, "pages"),
      "~/middleware": resolve(__dirname, "middleware"),
      "~/plugins": resolve(__dirname, "plugins"),
      "~/layouts": resolve(__dirname, "layouts"),
      "~/assets": resolve(__dirname, "assets"),
      "~/public": resolve(__dirname, "public"),
      "~/docs": resolve(__dirname, "docs"),
      "~/tests": resolve(__dirname, "tests"),
      "~/e2e": resolve(__dirname, "e2e"),
      "~/scripts": resolve(__dirname, "scripts"),
      "~/imports": resolve(__dirname, "imports"),
      "~/linearbudget": resolve(__dirname, "linearbudget"),
      "~/microservice": resolve(__dirname, "microservice"),
      "~/coverage": resolve(__dirname, "coverage"),
      "~/nextstepguru-project.json": resolve(
        __dirname,
        "nextstepguru-project.json"
      ),
    },
  },
});
