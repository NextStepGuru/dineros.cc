// Vitest + Nuxt 4: https://nuxt.com/docs/4.x/getting-started/testing
// Explicit projects: node (fast) vs nuxt runtime — avoids duplicate runs from defineVitestConfig auto-split.
// @nuxt/test-utils v3.x aligns with Vitest 3; v4+ peers vitest ^4 — upgrade both when moving to Vitest 4.
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
    },
  },
});
