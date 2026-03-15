import type { H3Event } from "h3";
import { z } from "zod";
import cuid2 from "@paralleldrive/cuid2";
import {
  postmarkClient,
  hasPostmarkToken,
} from "../clients/postmarkClient";
import env from "../env";
import { log } from "../logger";
import { prisma } from "../clients/prismaClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const body = await readBody(event);

    const forgotPasswordSchema = z.object({
      email: z.string().email(),
    });
    // Validate the request body
    const { email } = forgotPasswordSchema.parse(body);

    const lookupUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!lookupUser) {
      setResponseStatus(event, 404);
      return { message: "User not found" };
    }

    // Generate a random token
    const token = cuid2.createId().substring(0, 10);

    // Update the user's resetToken and expiration date
    await prisma.user.update({
      where: { id: lookupUser.id },
      data: {
        resetCode: token,
        resetPasswordAt: dateTimeService.add(5, "minute").toDate(),
      },
    });

    const isLocal = env?.DEPLOY_ENV === "local";
    if (hasPostmarkToken && !isLocal) {
      await postmarkClient.sendEmail({
        From: "Mr. Pepe Dineros <pepe@dineros.cc>",
        To: email,
        Subject: "Dineros Password Reset Request",
        HtmlBody: `${lookupUser.firstName},<br>
      <br>
      Your password reset code is: ${token}<br>
      <br>
      Please use this code to reset your password within 5 minutes. If you did not request this password reset, please ignore this email.
      <br>
      <br>
      Regards,<br>
      &nbsp;&nbsp;Mr. Pepe &amp; The Dineros Team
      `,
      });
    } else {
      log({
        message: "[FORGOT_PASSWORD] Reset code (email not sent; local or no Postmark token)",
        level: "info",
        data: { email, resetCode: token },
      });
    }

    setResponseStatus(event, 200);
    return { message: "Reset code sent" };
  } catch (error) {
    handleApiError(error);

    throw new Error("An error occurred while resetting password.");
  }
});
