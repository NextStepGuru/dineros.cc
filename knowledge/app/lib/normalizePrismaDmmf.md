---
type: Entity
title: normalizePrismaDmmf
description: Normalizes Prisma 7 DMMF so prisma-field-encryption's Zod schema accepts it.
generated: { by: agent/okf-generator, at: 2026-09-14T06:50:14Z }
---

# normalizePrismaDmmf

Normalizes Prisma 7 DMMF so prisma-field-encryption's Zod schema accepts it.

## Docstring

Normalizes Prisma 7 DMMF so prisma-field-encryption's Zod schema accepts it.
Prisma 7's simplified DMMF omits isList, isUnique, isId on fields; this adds defaults.

## Relationships

| Type | Target |
|------|--------|
| related | NormalizedDmmfField |
| related | NormalizedDmmfModel |
| related | NormalizedDmmf |
| related | RawField |
| related | FieldDocsMap |
| related | loadFieldDocsFromSchema |
| related | normalizePrismaDmmfForFieldEncryption |
