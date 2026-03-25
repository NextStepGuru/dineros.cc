import type { H3Event } from "h3";
import HashService from "../services/HashService";
import { passwordSchema } from "~/schema/zod";
import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { postmarkClient } from "../clients/postmarkClient";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);

    // Validate the request body
    const { newPassword } = passwordSchema.parse(body);

    const hashedPassword = await new HashService().hash(newPassword);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

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
