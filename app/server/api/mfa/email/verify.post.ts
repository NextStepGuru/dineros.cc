import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  clearPendingMfaSession,
  getPendingMfaSession,
  recordEmailOtpVerifyFailure,
  verifyEmailOtpForSession,
} from "~/server/lib/mfa";
import { completeLogin } from "~/server/lib/completeLogin";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { code } = z.object({ code: z.string().min(1) }).parse(body);
    const session = await getPendingMfaSession(event);

    if (!session?.methods?.includes("email")) {
      setResponseStatus(event, 401);
      return { errors: "No pending email OTP challenge found." };
    }

    const isValid = await verifyEmailOtpForSession(session.id, code);
    if (!isValid) {
      const fail = await recordEmailOtpVerifyFailure(session.id);
      if (fail === "locked") {
        setResponseStatus(event, 429);
        return {
          errors:
            "Too many invalid attempts. Request a new code from the login screen.",
        };
      }
      setResponseStatus(event, 401);
      return { errors: "Invalid verification code." };
    }

    await clearPendingMfaSession(event);
    return await completeLogin(event, session.userId);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
