// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";
import vueParser from "vue-eslint-parser";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default withNuxt([
  {
    ignores: [
      "prisma/reencrypt/index.ts",
      "microservice/prisma/reencrypt/index.ts",
    ],
  },
  // Register TypeScript ESLint plugin so @typescript-eslint/* rules are defined (e.g. in CI)
  {
    files: ["**/*.ts", "**/*.vue"],
    plugins: {
      "@typescript-eslint": /** @type {any} */ (tsPlugin),
    },
  },
  // Parse all .ts files as TypeScript (otherwise they fall back to JS parser and fail)
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
  },
  // Allow unused args/vars prefixed with _; relax no-unused-vars in test files
  {
    files: ["**/*.ts", "**/*.vue"],
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: [
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/vitest.setup.ts",
      "vitest.config.*.ts",
    ],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
        Mock: "readonly",
        MockedFunction: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parser: {
          ts: "@typescript-eslint/parser",
          js: "espree",
          "<template>": "espree",
        },
      },
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
  // Server: single datetime authority — no direct Date/Date.now outside DateTime service
  {
    files: ["server/**/*.ts"],
    ignores: [
      "server/services/forecast/DateTime.ts",
      "server/services/forecast/DateTimeService.ts",
      "**/__tests__/**",
      "**/*.test.ts",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "Use dateTimeService (DateTimeService) for all date/time. No direct new Date(...) in server code.",
        },
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Use dateTimeService.now() or dateTimeService.nowDate() for current time. No direct Date.now() in server code.",
        },
      ],
    },
  },
]);
