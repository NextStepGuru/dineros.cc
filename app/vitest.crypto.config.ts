/**
 * Runs Hash/Jwt/Rsa service tests excluded from the default node project
 * (`vitestSlowTestExcludes` in vitest.test-globs.ts).
 */
import { defineConfig } from "vitest/config";
import { vitestResolveAliases } from "./vitest.resolve-aliases";

const cryptoServiceTests = [
  "server/services/__tests__/HashService.test.ts",
  "server/services/__tests__/JwtService.test.ts",
  "server/services/__tests__/RsaService.test.ts",
] as const;

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
    environment: "node",
    include: [...cryptoServiceTests],
  },
});
