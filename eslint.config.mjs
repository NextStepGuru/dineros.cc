// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";
import vueParser from "vue-eslint-parser";
import tsParser from "@typescript-eslint/parser";

export default withNuxt([
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
      "no-unused-vars": "off"
    }
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
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Use dateTimeService.now() or dateTimeService.nowDate() for current time. No direct Date.now() in server code.",
        },
      ],
    },
  },
]);
