import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootSchemaPath = resolve(process.cwd(), "prisma/schema.prisma");
const microSchemaPath = resolve(
  process.cwd(),
  "microservice/prisma/schema.prisma",
);

const allowedRootOnlyModels = new Set(["SavingsGoal"]);
const allowedMicroserviceOnlyModels = new Set([]);

function getModelNames(schemaText) {
  const matches = schemaText.matchAll(/^model\s+(\w+)\s+\{/gm);
  return new Set(Array.from(matches, (match) => match[1]));
}

function setDiff(left, right) {
  return Array.from(left).filter((item) => !right.has(item));
}

const rootSchema = readFileSync(rootSchemaPath, "utf8");
const microSchema = readFileSync(microSchemaPath, "utf8");

const rootModels = getModelNames(rootSchema);
const microModels = getModelNames(microSchema);

const rootOnly = setDiff(rootModels, microModels);
const microOnly = setDiff(microModels, rootModels);

const unexpectedRootOnly = rootOnly.filter(
  (model) => !allowedRootOnlyModels.has(model),
);
const unexpectedMicroOnly = microOnly.filter(
  (model) => !allowedMicroserviceOnlyModels.has(model),
);

if (unexpectedRootOnly.length > 0 || unexpectedMicroOnly.length > 0) {
  console.error("Prisma schema governance check failed.");
  if (unexpectedRootOnly.length > 0) {
    console.error(
      `Unexpected root-only models: ${unexpectedRootOnly.join(", ")}`,
    );
  }
  if (unexpectedMicroOnly.length > 0) {
    console.error(
      `Unexpected microservice-only models: ${unexpectedMicroOnly.join(", ")}`,
    );
  }
  process.exit(1);
}

console.log("Prisma schema governance check passed.");
