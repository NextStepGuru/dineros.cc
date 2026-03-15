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

type RawField = { name: string; kind?: string; type: unknown; documentation?: string; isList?: boolean; isUnique?: boolean; isId?: boolean };

export function normalizePrismaDmmfForFieldEncryption(raw: unknown): NormalizedDmmf {
  const r = raw as { datamodel?: { models?: Array<{ name: string; fields?: RawField[] }> } };
  const models = r?.datamodel?.models ?? [];
  return {
    datamodel: {
      models: models.map((model) => ({
        name: model.name,
        fields: (model.fields ?? []).map((f: RawField) => ({
          name: f.name,
          isList: typeof f.isList === "boolean" ? f.isList : f.kind === "object",
          isUnique: typeof f.isUnique === "boolean" ? f.isUnique : false,
          isId:
            typeof f.isId === "boolean"
              ? f.isId
              : f.name === "id" && f.kind === "scalar",
          type: f.type,
          ...(f.documentation != null && { documentation: f.documentation }),
        })),
      })),
    },
  };
}
