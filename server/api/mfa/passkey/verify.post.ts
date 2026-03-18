import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";
import { prisma } from "~/server/clients/prismaClient";
import { privateUserSchema } from "~/schema/zod";
import { handleApiError } from "~/server/lib/handleApiError";
import {
  clearPendingMfaSession,
  getPendingMfaSession,
  getWebAuthnConfig,
  withUpdatedPasskeys,
} from "~/server/lib/mfa";
import { sharedRedisConnection } from "~/server/clients/redisClient";
import { completeLogin } from "~/server/lib/completeLogin";

const verifyPasskeySchema = z.object({
  response: z.any(),
});

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { response } = verifyPasskeySchema.parse(body);
    const session = await getPendingMfaSession(event);

    if (!session || !session.methods.includes("passkey")) {
      setResponseStatus(event, 401);
      return { errors: "No pending passkey challenge found." };
    }

    const expectedChallenge = await sharedRedisConnection.get(
      `mfa:passkey:auth:${session.id}`
    );
    if (!expectedChallenge) {
      setResponseStatus(event, 401);
      return { errors: "Passkey challenge has expired." };
    }

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    const user = privateUserSchema.parse(lookup);
    const passkeys = user.settings.mfa.passkeys || [];
    const passkey = passkeys.find((item) => item.id === response?.id);

    if (!passkey) {
      setResponseStatus(event, 401);
      return { errors: "Passkey is not registered for this account." };
    }

    const { rpID, origin } = getWebAuthnConfig();
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter ?? 0,
        transports: passkey.transports as
          | ("ble" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb" | "cable")[]
          | undefined,
      },
    });

    if (!verification.verified) {
      setResponseStatus(event, 401);
      return { errors: "Passkey verification failed." };
    }

    const nextPasskeys = passkeys.map((item) =>
      item.id === passkey.id
        ? {
            ...item,
            counter: verification.authenticationInfo.newCounter,
          }
        : item
    );

    await prisma.user.update({
      where: { id: user.id },
      data: {
        settings: JSON.parse(
          JSON.stringify(withUpdatedPasskeys(user.settings, nextPasskeys))
        ),
      },
    });

    await clearPendingMfaSession(event);
    await sharedRedisConnection.del(`mfa:passkey:auth:${session.id}`);
    return await completeLogin(event, user.id);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
