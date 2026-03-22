import type { PrismaClient } from "@prisma/client";

/** Ensures `categoryId` exists, belongs to `accountId`, and is not archived. No-op when null/undefined. */
export async function ensureCategoryForAccount(
  db: Pick<PrismaClient, "category">,
  categoryId: string | null | undefined,
  accountId: string,
): Promise<void> {
  if (categoryId == null) return;
  await db.category.findFirstOrThrow({
    where: {
      id: categoryId,
      accountId,
      isArchived: false,
    },
  });
}
