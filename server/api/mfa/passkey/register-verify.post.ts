import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { prisma } from "~/server/clients/prismaClient";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { getWebAuthnConfig, withUpdatedPasskeys } from "~/server/lib/mfa";
import { sharedRedisConnection } from "~/server/clients/redisClient";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";

const verifyRegistrationSchema = z.object({
  response: z.any(),
  name: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);
    const { response, name } = verifyRegistrationSchema.parse(body);
    const expectedChallenge = await sharedRedisConnection.get(
      `mfa:passkey:register:${userId}`,
    );

    if (!expectedChallenge) {
      setResponseStatus(event, 401);
      return { errors: "No pending passkey registration challenge found." };
    }

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const user = privateUserSchema.parse(lookup);
    const { rpID, origin } = getWebAuthnConfig();

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    await sharedRedisConnection.del(`mfa:passkey:register:${userId}`);

    if (!verification.verified || !verification.registrationInfo) {
      setResponseStatus(event, 401);
      return { errors: "Passkey registration verification failed." };
    }

    const credential = verification.registrationInfo.credential;
    const existingPasskeys = user.settings.mfa.passkeys || [];
    const hasCredential = existingPasskeys.some(
      (passkey) => passkey.id === credential.id,
    );

    if (!hasCredential) {
      const nextPasskeys = [
        ...existingPasskeys,
        {
          id: credential.id,
          publicKey: isoBase64URL.fromBuffer(credential.publicKey),
          counter: credential.counter,
          transports: Array.isArray(response?.response?.transports)
            ? response.response.transports
            : undefined,
          name: name?.trim() || `Security key ${existingPasskeys.length + 1}`,
          createdAt: dateTimeService.toISOString(),
        },
      ];

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          settings: JSON.parse(
            JSON.stringify(withUpdatedPasskeys(user.settings, nextPasskeys)),
          ),
        },
      });

      return publicProfileSchema.parse(updated);
    }

    return publicProfileSchema.parse(user);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
