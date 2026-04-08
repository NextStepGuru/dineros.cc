import type { H3Event } from "h3";
import { createError } from "h3";
import HashService from "../services/HashService";
import { changePasswordSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { postmarkClient } from "../clients/postmarkClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { rotateUserJwtKey } from "~/server/lib/rotateUserJwtKey";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    const { newPassword, currentPassword } = changePasswordSchema.parse(body);

    const existing = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!existing.password) {
      throw createError({
        statusCode: 400,
        statusMessage: "Password change not available for this account.",
      });
    }

    const ok = await new HashService().verify(
      existing.password,
      currentPassword,
    );
    if (!ok) {
      throw createError({
        statusCode: 401,
        statusMessage: "Current password is incorrect.",
      });
    }

    const hashedPassword = await new HashService().hash(newPassword);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    await rotateUserJwtKey(userId);

    await postmarkClient.sendEmail({
      From: "Mr. Pepe Dineros <pepe@dineros.cc>",
      To: updatedUser.email,
      Subject: "Dineros Password Reset",
      HtmlBody: `${updatedUser.firstName},<br>
      <br>
      Your password was reset!<br>
      <br>
      If you did not request this password reset, please reply to this email immediate so we can investigate.
      <br>
      <br>
      Regards,<br>
      &nbsp;&nbsp;Mr. Pepe &amp; The Dineros Team
      `,
    });

    return { message: "Password changed successfully." };
  } catch (error) {
    handleApiError(error);

    throw new Error("An error occurred while changing password.");
  }
});
