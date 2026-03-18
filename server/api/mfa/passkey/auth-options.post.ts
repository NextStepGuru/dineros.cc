import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "~/server/clients/prismaClient";
import { privateUserSchema } from "~/schema/zod";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  getPendingMfaSession,
  getWebAuthnConfig,
} from "~/server/lib/mfa";
import { sharedRedisConnection } from "~/server/clients/redisClient";

const PASSKEY_AUTH_CHALLENGE_TTL = 10 * 60;

export default defineEventHandler(async (event) => {
  try {
    const session = await getPendingMfaSession(event);

    if (!session || !session.methods.includes("passkey")) {
      setResponseStatus(event, 401);
      return { errors: "No pending passkey challenge found." };
    }

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    const user = privateUserSchema.parse(lookup);
    const { rpID } = getWebAuthnConfig();

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: (user.settings.mfa.passkeys || []).map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports as
          | ("ble" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb" | "cable")[]
          | undefined,
      })),
    });

    await sharedRedisConnection.setex(
      `mfa:passkey:auth:${session.id}`,
      PASSKEY_AUTH_CHALLENGE_TTL,
      options.challenge
    );

    return options;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
