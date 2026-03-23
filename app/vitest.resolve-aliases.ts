import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Vite resolve.alias for `~/…` in Vitest (each project must merge this; root resolve is not inherited). */
export const vitestResolveAliases = {
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
    "nextstepguru-project.json",
  ),
} as const;

export const vitestAliasLayer = {
  resolve: { alias: { ...vitestResolveAliases } },
};
