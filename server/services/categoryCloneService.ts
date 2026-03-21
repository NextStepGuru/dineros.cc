import { randomUUID } from "node:crypto";
import type { prisma } from "~/server/clients/prismaClient";

type Tx = typeof prisma;

/**
 * Clone all non-archived categories from source financial Account to target Account.
 * Inserts parents before children (subCategoryId). Returns old id -> new id for remapping FKs.
 */
export async function cloneCategoriesForAccount(
  tx: Tx,
  sourceAccountId: string,
  targetAccountId: string,
): Promise<Map<string, string>> {
  const categories = await tx.category.findMany({
    where: { accountId: sourceAccountId, isArchived: false },
  });

  if (categories.length === 0) {
    return new Map();
  }

  const idMap = new Map<string, string>();
  const remaining = new Set(categories.map((c) => c.id));

  while (remaining.size > 0) {
    const batch = categories.filter(
      (c) =>
        remaining.has(c.id) &&
        (c.subCategoryId == null || idMap.has(c.subCategoryId)),
    );
    if (batch.length === 0) {
      throw new Error(
        "Category clone: cycle or missing parent in category tree for account",
      );
    }
    for (const c of batch) {
      const newId = randomUUID();
      await tx.category.create({
        data: {
          id: newId,
          accountId: targetAccountId,
          name: c.name,
          isArchived: c.isArchived,
          subCategoryId: c.subCategoryId
            ? (idMap.get(c.subCategoryId) ?? null)
            : null,
        },
      });
      idMap.set(c.id, newId);
      remaining.delete(c.id);
    }
  }

  return idMap;
}
