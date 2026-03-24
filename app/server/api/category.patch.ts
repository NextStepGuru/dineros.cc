import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { categorySchema } from "~/schema/zod";
import { z } from "zod";

const bodySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  isArchived: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = await readBody(event);
    const parsed = bodySchema.parse(body);

    await PrismaDb.category.findFirstOrThrow({
      where: {
        id: parsed.id,
        account: {
          userAccounts: { some: { userId: user.userId } },
        },
      },
    });

    const category = await PrismaDb.category.update({
      where: { id: parsed.id },
      data: {
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.isArchived !== undefined && { isArchived: parsed.isArchived }),
      },
    });

    return categorySchema.parse(category);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
