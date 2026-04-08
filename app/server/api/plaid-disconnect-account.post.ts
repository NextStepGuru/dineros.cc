import { PlaidApi } from "plaid";
import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { configuration } from "../lib/getPlaidClient";
import { privateUserSchema } from "~/schema/zod";
import { resolvePlaidAccessTokenFromStored } from "~/server/lib/plaidAccessTokenCrypto";
import { log } from "~/server/logger";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);

    const disconnectSchema = z.object({
      accountRegisterId: z.coerce.number(),
    });
    const { accountRegisterId } = disconnectSchema.parse(body);

    const register = await prisma.accountRegister.findFirstOrThrow({
      where: {
        id: accountRegisterId,
        account: {
          userAccounts: {
            some: {
              userId,
            },
          },
        },
        plaidId: {
          not: null,
        },
      },
      select: {
        id: true,
        plaidId: true,
        plaidAccessToken: true,
      },
    });

    const userRow = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const user = privateUserSchema.parse(userRow);
    const plaidSettings = user.settings?.plaid;
    const itemId =
      plaidSettings && typeof plaidSettings.item_id === "string"
        ? plaidSettings.item_id
        : undefined;
    const tokenFromSettings =
      plaidSettings &&
      typeof plaidSettings.access_token === "string"
        ? resolvePlaidAccessTokenFromStored(plaidSettings.access_token)
        : null;

    const accessToken = register.plaidAccessToken ?? tokenFromSettings ?? null;

    const otherLinked = await prisma.accountRegister.count({
      where: {
        id: { not: accountRegisterId },
        account: {
          userAccounts: {
            some: { userId },
          },
        },
        plaidId: { not: null },
      },
    });

    if (otherLinked === 0 && accessToken) {
      try {
        const client = new PlaidApi(configuration);
        await client.itemRemove({ access_token: accessToken });
      } catch (e) {
        log({
          message: "Plaid itemRemove failed during disconnect",
          level: "warn",
          data: { userId, accountRegisterId, error: e },
        });
      }
      if (itemId) {
        await prisma.plaidItem.deleteMany({ where: { itemId } });
        await prisma.plaidSyncCursor.deleteMany({ where: { itemId } });
      }
      const nextSettings = structuredClone(user.settings);
      delete (nextSettings as { plaid?: unknown }).plaid;
      await prisma.user.update({
        where: { id: userId },
        data: {
          settings: nextSettings,
        },
      });
    }

    await prisma.accountRegister.update({
      where: {
        id: accountRegisterId,
      },
      data: {
        plaidId: null,
        plaidAccessToken: null,
        plaidAccessTokenHash: null,
        plaidIdHash: null,
        plaidJson: undefined,
        plaidLastSyncAt: null,
        plaidBalanceLastSyncAt: null,
      },
    });

    return {
      success: true,
      message: "Account disconnected successfully",
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
