import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { createError, readBody } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { addRecalculateJob } from "~/server/clients/queuesClient";
import { z } from "zod";

const orderBodySchema = z.object({
  goalIds: z.array(z.number().int().positive()),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = await readBody(event);
    const { goalIds } = orderBodySchema.parse(body);

    if (goalIds.length === 0) {
      return { success: true };
    }

    const goals = await PrismaDb.savingsGoal.findMany({
      where: {
        id: { in: goalIds },
        isArchived: false,
        account: {
          userAccounts: { some: { userId: user.userId } },
        },
      },
      select: { id: true, accountId: true },
    });

    if (goals.length !== goalIds.length) {
      throw createError({
        statusCode: 400,
        statusMessage: "One or more savings goals not found or not accessible",
      });
    }

    await PrismaDb.$transaction(
      goalIds.map((id, index) =>
        PrismaDb.savingsGoal.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );

    const accountId = goals[0]?.accountId;
    if (accountId) {
      addRecalculateJob({ accountId });
    }

    return { success: true };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
