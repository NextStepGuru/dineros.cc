import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { z } from "zod";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const query = getQuery(event);
    const querySchema = z.object({
      accountId: z.string().uuid().optional(),
    });
    const { accountId } = querySchema.parse(query);

    const where = {
      isArchived: false,
      account: {
        userAccounts: {
          some: { userId: user.userId },
        },
      },
      ...(accountId ? { accountId } : {}),
    };

    const categories = await PrismaDb.category.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return categories;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
