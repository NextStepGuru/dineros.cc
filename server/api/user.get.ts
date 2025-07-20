import { publicProfileSchema } from "~/schema/zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import type { H3Event } from "h3";
import { defineEventHandler } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const { userId } = getUser(event);

    const lookupUser = await PrismaDb.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
    });

    return publicProfileSchema.parse(lookupUser);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
