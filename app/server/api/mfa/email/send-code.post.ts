import { postmarkClient, hasPostmarkToken } from "~/server/clients/postmarkClient";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  canSendEmailOtp,
  generateNumericOtpCode,
  getPendingMfaSession,
  hashOtp,
  storeEmailOtpForSession,
} from "~/server/lib/mfa";
import { log } from "~/server/logger";
import env from "~/server/env";

export default defineEventHandler(async (event) => {
  try {
    const session = await getPendingMfaSession(event);

    if (!session || !session.methods.includes("email")) {
      setResponseStatus(event, 401);
      return { errors: "No pending email OTP challenge found." };
    }

    const canSend = await canSendEmailOtp(session.userId);
    if (!canSend) {
      setResponseStatus(event, 429);
      return { errors: "Too many email OTP requests. Please try again later." };
    }

    const otpCode = generateNumericOtpCode(6);
    await storeEmailOtpForSession(session.id, hashOtp(otpCode));

    const isLocal = env?.DEPLOY_ENV === "local";
    if (hasPostmarkToken && !isLocal) {
      await postmarkClient.sendEmail({
        From: "Mr. Pepe Dineros <pepe@dineros.cc>",
        To: session.email,
        Subject: "Your Dineros security verification code",
        HtmlBody: `Your verification code is <b>${otpCode}</b>.<br/><br/>It expires in 10 minutes.`,
      });
    } else {
      log({
        message: "[MFA][EMAIL] OTP generated (email not sent; local or no Postmark token)",
        level: "info",
        data: {
          userId: session.userId,
          email: session.email,
          otpCode,
        },
      });
    }

    return { message: "Verification code sent." };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
