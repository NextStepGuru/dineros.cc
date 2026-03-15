import { publicProfileSchema } from "~/schema/zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import type { H3Event } from "h3";
import { defineEventHandler } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";
import { z } from "zod";

/** Response schema: allow any string for email so legacy/invalid DB values don't 400 */
const userGetResponseSchema = publicProfileSchema.extend({
  email: z.string(),
});

export default defineEventHandler(async (event: H3Event) => {
  try {
    const { userId } = getUser(event);

    const lookupUser = await PrismaDb.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
    });

    return userGetResponseSchema.parse(lookupUser);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
