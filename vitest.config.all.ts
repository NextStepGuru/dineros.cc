import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
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
      "lib/__tests__/**/*.test.ts",
      "pages/__tests__/**/*.test.ts",
      "tests/**/*.test.ts",
    ],

    // NO exclusions - run all tests
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
      "~/nextstepguru-ce5dcf7b0730.json": resolve(
        __dirname,
        "nextstepguru-ce5dcf7b0730.json"
      ),
    },
  },
});
