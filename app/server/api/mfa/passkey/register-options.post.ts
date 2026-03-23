import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getUser } from "~/server/lib/getUser";
import { prisma } from "~/server/clients/prismaClient";
import { privateUserSchema } from "~/schema/zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { getWebAuthnConfig } from "~/server/lib/mfa";
import { sharedRedisConnection } from "~/server/clients/redisClient";

const PASSKEY_REGISTER_CHALLENGE_TTL = 10 * 60;

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const user = privateUserSchema.parse(lookup);
    const { rpID, rpName } = getWebAuthnConfig();
    const passkeys = user.settings.mfa.passkeys || [];

    const options = await generateRegistrationOptions({
      rpID,
      rpName,
      userName: user.email,
      userDisplayName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      excludeCredentials: passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports as
          | ("ble" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb" | "cable")[]
          | undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    await sharedRedisConnection.setex(
      `mfa:passkey:register:${userId}`,
      PASSKEY_REGISTER_CHALLENGE_TTL,
      options.challenge
    );

    return options;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
