import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import type { H3Event } from "h3";
import { publicProfileSchema } from "~/schema/zod";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);

    const {
      email,
      firstName,
      lastName,
      countryId,
      timezoneOffset,
      isDaylightSaving,
    } = publicProfileSchema.parse(body);

    const { id } = await PrismaDb.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
    });

    const updatedUser = await PrismaDb.user.update({
      data: {
        email,
        firstName,
        lastName,
        countryId,
        timezoneOffset,
        isDaylightSaving,
      },
      where: { id },
    });

    return publicProfileSchema.parse(updatedUser);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
