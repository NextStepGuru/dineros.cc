import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { prisma } from "../clients/prismaClient";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);

    const results = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: JSON.parse(
          JSON.stringify({
            ...user.settings,
            speakeasy: { isEnabled: false, isVerified: false },
          })
        ),
      },
    });

    return publicProfileSchema.parse(results);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
