import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { categorySchema } from "~/schema/zod";
import { z } from "zod";

const bodySchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  subCategoryId: z.string().uuid().nullable().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = await readBody(event);
    const { accountId, name, subCategoryId } = bodySchema.parse(body);

    await PrismaDb.account.findFirstOrThrow({
      where: {
        id: accountId,
        userAccounts: { some: { userId: user.userId } },
      },
    });

    const category = await PrismaDb.category.create({
      data: {
        accountId,
        name,
        subCategoryId: subCategoryId ?? null,
      },
    });

    return categorySchema.parse(category);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
