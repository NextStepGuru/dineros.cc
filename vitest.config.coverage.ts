import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import { defineVitestProject } from "@nuxt/test-utils/config";
import {
  vitestNodeTestIncludes,
  vitestNodeProjectExcludes,
} from "./vitest.test-globs";
import { vitestResolveAliases, vitestAliasLayer } from "./vitest.resolve-aliases";

const nuxtProject = await defineVitestProject({
  test: {
    name: "nuxt",
    include: ["tests/nuxt/**/*.test.ts", "**/*.nuxt.{test,spec}.ts"],
  },
});

export default defineConfig({
  resolve: {
    alias: { ...vitestResolveAliases },
  },
  test: {
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
        maxForks: 4,
        minForks: 2,
        isolate: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 5000,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "error",
    },
    silent: true,
    projects: [
      mergeConfig(vitestAliasLayer, {
        test: {
          name: "node",
          environment: "node",
          include: [...vitestNodeTestIncludes],
          exclude: [...vitestNodeProjectExcludes],
        },
      }),
      mergeConfig(vitestAliasLayer, nuxtProject),
    ],
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
      thresholds: {
        global: {
          branches: 70,
          functions: 75,
          lines: 80,
          statements: 80,
        },
      },
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
