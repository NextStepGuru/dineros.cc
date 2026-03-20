import { createError } from "h3";
import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const { id: registerSnapshotId } = paramsSchema.parse(
      event.context.params ?? {},
    );

    const row = await PrismaDb.accountRegisterSnapshot.findFirst({
      where: {
        id: registerSnapshotId,
        snapshot: {
          account: {
            userAccounts: {
              some: { userId: user.userId },
            },
          },
        },
      },
      include: {
        entries: {
          orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!row) {
      throw createError({
        statusCode: 404,
        statusMessage: "Register snapshot not found",
      });
    }

    const entries = row.entries.map((e) => ({
      id: `snap-${e.id}`,
      accountRegisterId: row.accountRegisterId,
      sourceAccountRegisterId: undefined as number | undefined,
      createdAt: e.createdAt.toISOString(),
      description: e.description,
      reoccurrenceId: null as number | null,
      amount: Number(e.amount),
      balance: Number(e.balance),
      typeId: null as number | null,
      categoryId: e.categoryId,
      isCleared: false,
      isReconciled: false,
      isProjected: e.isProjected,
      isBalanceEntry: e.isBalanceEntry,
      isPending: e.isPending,
      plaidId: null as string | null,
    }));

    let lowest = entries[0];
    let highest = entries[0];
    if (entries.length > 0) {
      for (const e of entries) {
        if (lowest && e.balance < lowest.balance) lowest = e;
        if (highest && e.balance > highest.balance) highest = e;
      }
    }

    return {
      entries,
      lowest: lowest ?? undefined,
      highest: highest ?? undefined,
      skip: 0,
      focusedAt: dateTimeService.nowDate().toISOString(),
      take: entries.length,
      loadMode: "snapshot" as const,
      isPartialLoad: false,
      hasMore: false,
      totalCount: entries.length,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
