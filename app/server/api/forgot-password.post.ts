import type { H3Event } from "h3";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  postmarkClient,
  hasPostmarkToken,
} from "../clients/postmarkClient";
import env from "../env";
import { log } from "../logger";
import { prisma } from "../clients/prismaClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";
import {
  clientIpFromEvent,
  rateLimitByKey,
} from "~/server/lib/rateLimitRedis";

export default defineEventHandler(async (event: H3Event) => {
  try {
    const ip = clientIpFromEvent(event);
    const rl = await rateLimitByKey({
      key: `forgot-pw:ip:${ip}`,
      limit: 10,
      windowSeconds: 3600,
    });
    if (!rl.allowed) {
      setResponseStatus(event, 429);
      return {
        message: "Too many requests. Please try again later.",
        retryAfterSec: rl.retryAfterSec,
      };
    }

    const body = await readBody(event);

    const forgotPasswordSchema = z.object({
      email: z.email(),
    });
    const { email } = forgotPasswordSchema.parse(body);

    const lookupUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!lookupUser) {
      log({
        message: "[FORGOT_PASSWORD] Unknown email (generic response)",
        level: "info",
        data: { emailRequested: true },
      });
      setResponseStatus(event, 200);
      return {
        message:
          "If an account exists for that email, we sent a reset code. Check your inbox.",
      };
    }

    const token = randomBytes(32).toString("hex");

    await prisma.user.update({
      where: { id: lookupUser.id },
      data: {
        resetCode: token,
        resetPasswordAt: dateTimeService.add(15, "minute").toDate(),
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
      Please use this code to reset your password within 15 minutes. If you did not request this password reset, please ignore this email.
      <br>
      <br>
      Regards,<br>
      &nbsp;&nbsp;Mr. Pepe &amp; The Dineros Team
      `,
      });
    } else if (isLocal) {
      log({
        message:
          "[FORGOT_PASSWORD] Reset code (local only; email not sent)",
        level: "info",
        data: { userId: lookupUser.id },
      });
    }

    setResponseStatus(event, 200);
    return {
      message:
        "If an account exists for that email, we sent a reset code. Check your inbox.",
    };
  } catch (error) {
    handleApiError(error);

    throw new Error("An error occurred while resetting password.");
  }
});
