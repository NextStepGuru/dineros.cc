// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";
import vueParser from "vue-eslint-parser";

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
]);
