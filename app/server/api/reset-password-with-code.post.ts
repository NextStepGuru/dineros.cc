import type { H3Event } from "h3";
import { createError } from "h3";
import { postmarkClient } from "../clients/postmarkClient";
import HashService from "../services/HashService";
import { passwordAndCodeSchema } from "~/schema/zod";
import { prisma } from "../clients/prismaClient";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);

    // Validate the request body
    const { resetCode, newPassword } = passwordAndCodeSchema.parse(body);

    const verifyUser = await prisma.user.findFirst({
      where: { resetCode },
    });

    if (!verifyUser) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid Reset Code",
      });
    }

    const password = await new HashService().hash(newPassword);

    // Update the user's resetToken and expiration date
    await prisma.user.update({
      where: { id: verifyUser.id },
      data: {
        resetCode: null,
        resetPasswordAt: null,
        password,
      },
    });

    await postmarkClient.sendEmail({
      From: "Mr. Pepe Dineros <pepe@dineros.cc>",
      To: verifyUser.email,
      Subject: "Dineros Password Reset",
      HtmlBody: `${verifyUser.firstName},<br>
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

    setResponseStatus(event, 200);
    return { message: "Password was reset" };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
