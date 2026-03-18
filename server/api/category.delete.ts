import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { categorySchema } from "~/schema/zod";
import { z } from "zod";

const querySchema = z.object({
  id: z.string().uuid(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const query = getQuery(event);
    const { id } = querySchema.parse(query);

    await PrismaDb.category.findFirstOrThrow({
      where: {
        id,
        account: {
          userAccounts: { some: { userId: user.userId } },
        },
      },
    });

    const entryCount = await PrismaDb.registerEntry.count({
      where: { categoryId: id },
    });

    let category;
    if (entryCount > 0) {
      category = await PrismaDb.category.update({
        where: { id },
        data: { isArchived: true },
      });
    } else {
      category = await PrismaDb.category.delete({
        where: { id },
      });
    }

    return categorySchema.parse(category);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
