import { createError, getRouterParam } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const rawId = getRouterParam(event, "id");
    const userId = rawId ? Number.parseInt(rawId, 10) : Number.NaN;
    if (!Number.isInteger(userId) || userId < 1) {
      throw createError({ statusCode: 400, statusMessage: "Invalid user id" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw createError({ statusCode: 404, statusMessage: "User not found" });
    }

    const items = await prisma.plaidItem.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        itemId: true,
        userId: true,
        updatedAt: true,
      },
    });

    const itemIds = items.map((i) => i.itemId);
    const cursors =
      itemIds.length > 0
        ? await prisma.plaidSyncCursor.findMany({
            where: { itemId: { in: itemIds } },
            select: { itemId: true, updatedAt: true },
          })
        : [];

    const cursorByItem = new Map(cursors.map((c) => [c.itemId, c.updatedAt]));

    return {
      items: items.map((i) => ({
        itemId: i.itemId,
        userId: i.userId,
        updatedAt: i.updatedAt,
        syncCursorUpdatedAt: cursorByItem.get(i.itemId) ?? null,
      })),
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
