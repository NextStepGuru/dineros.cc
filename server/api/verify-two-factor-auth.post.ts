import speakeasy from "speakeasy";
import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { token } = z.object({ token: z.string() }).parse(body);
    const { userId } = getUser(event);
    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);

    if (!user.settings.speakeasy.base32secret) {
      return false;
    }

    const results = speakeasy.totp.verify({
      secret: user.settings.speakeasy.base32secret,
      encoding: "base32",
      token,
      window: 10,
    });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        settings: JSON.parse(
          JSON.stringify({
            ...user.settings,
            speakeasy: {
              ...user.settings.speakeasy,
              isVerified: results,
            },
          })
        ),
      },
    });

    return publicProfileSchema.parse(updatedUser);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
