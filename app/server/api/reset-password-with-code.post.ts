import type { H3Event } from "h3";
import { createError } from "h3";
import { postmarkClient } from "../clients/postmarkClient";
import HashService from "../services/HashService";
import { passwordAndCodeSchema } from "~/schema/zod";
import { prisma } from "../clients/prismaClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { rotateUserJwtKey } from "~/server/lib/rotateUserJwtKey";
import { stripMfaFromUserSettings } from "~/server/lib/stripMfaSettings";
import {
  clientIpFromEvent,
  rateLimitByKey,
} from "~/server/lib/rateLimitRedis";
import { dateTimeService } from "~/server/services/forecast";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const ip = clientIpFromEvent(event);
    const rl = await rateLimitByKey({
      key: `reset-pw-code:ip:${ip}`,
      limit: 20,
      windowSeconds: 3600,
    });
    if (!rl.allowed) {
      throw createError({
        statusCode: 429,
        statusMessage: "Too many attempts. Please try again later.",
      });
    }

    const body = await readBody(event);

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

    if (!verifyUser.resetPasswordAt) {
      throw createError({
        statusCode: 400,
        statusMessage: "Reset code expired",
      });
    }

    const deadline = dateTimeService
      .createUTC(verifyUser.resetPasswordAt)
      .add(15, "minute");
    if (dateTimeService.now().isAfter(deadline)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Reset code expired",
      });
    }

    const password = await new HashService().hash(newPassword);

    await prisma.user.update({
      where: { id: verifyUser.id },
      data: {
        resetCode: null,
        resetPasswordAt: null,
        password,
        settings: stripMfaFromUserSettings(verifyUser.settings),
      },
    });

    await rotateUserJwtKey(verifyUser.id);

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
