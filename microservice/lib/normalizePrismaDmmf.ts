import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Normalizes Prisma 7 DMMF so prisma-field-encryption's Zod schema accepts it.
 * Prisma 7's simplified DMMF omits isList, isUnique, isId on fields; this adds defaults.
 */
export type NormalizedDmmfField = {
  name: string;
  isList: boolean;
  isUnique: boolean;
  isId: boolean;
  type: unknown;
  documentation?: string;
};

export type NormalizedDmmfModel = {
  name: string;
  fields: NormalizedDmmfField[];
};

export type NormalizedDmmf = {
  datamodel: {
    models: NormalizedDmmfModel[];
  };
};

type RawField = {
  name: string;
  kind?: string;
  type: unknown;
  documentation?: string;
  isList?: boolean;
  isUnique?: boolean;
  isId?: boolean;
};

type FieldDocsMap = Record<string, Record<string, string>>;

let cachedFieldDocs: FieldDocsMap | null = null;

function loadFieldDocsFromSchema(): FieldDocsMap {
  if (cachedFieldDocs) return cachedFieldDocs;

  const schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
  if (!existsSync(schemaPath)) {
    cachedFieldDocs = {};
    return cachedFieldDocs;
  }

  const content = readFileSync(schemaPath, "utf8");
  const docs: FieldDocsMap = {};
  let currentModel: string | null = null;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;

    const modelMatch = line.match(/^model\s+(\w+)\s+\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      docs[currentModel] ??= {};
      continue;
    }

    if (line === "}") {
      currentModel = null;
      continue;
    }

    if (!currentModel) continue;

    const fieldWithDoc = rawLine.match(/^\s*(\w+)\s+.+\/\/\/\s*(.+)\s*$/);
    if (!fieldWithDoc) continue;

    const [, fieldName, documentation] = fieldWithDoc;
    docs[currentModel][fieldName] = documentation.trim();
  }

  cachedFieldDocs = docs;
  return docs;
}

export function normalizePrismaDmmfForFieldEncryption(
  raw: unknown
): NormalizedDmmf {
  const r = raw as {
    datamodel?: { models?: Array<{ name: string; fields?: RawField[] }> };
  };
  const models = r?.datamodel?.models ?? [];
  const fieldDocs = loadFieldDocsFromSchema();
  return {
    datamodel: {
      models: models.map((model) => ({
        name: model.name,
        fields: (model.fields ?? []).map((f: RawField) => ({
          name: f.name,
          isList:
            typeof f.isList === "boolean" ? f.isList : f.kind === "object",
          isUnique: typeof f.isUnique === "boolean" ? f.isUnique : false,
          isId:
            typeof f.isId === "boolean"
              ? f.isId
              : f.name === "id" && f.kind === "scalar",
          type: f.type,
          ...((f.documentation ?? fieldDocs[model.name]?.[f.name]) != null && {
            documentation: f.documentation ?? fieldDocs[model.name]?.[f.name],
          }),
        })),
      })),
    },
  };
}
