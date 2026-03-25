import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);

    const disconnectSchema = z.object({
      accountRegisterId: z.coerce.number(),
    });
    const { accountRegisterId } = disconnectSchema.parse(body);

    // Verify user has access to this account register
    await prisma.accountRegister.findFirstOrThrow({
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
      },
    });

    // Disconnect the account by clearing Plaid-related fields
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
