import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { privateUserSchema } from "~/schema/zod";
import { plaidAccountSchema } from "~/schema/plaid";
import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";
import { plaidIsActiveForUser } from "~/server/lib/plaidUserAccess";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);

    const isPlaidEnabled = await plaidIsActiveForUser(userId, user);

    const syncedAccounts = await prisma.accountRegister.findMany({
      where: {
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
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        plaidId: true,
        plaidLastSyncAt: true,
        plaidBalanceLastSyncAt: true,
        balance: true,
        type: {
          select: {
            name: true,
            isCredit: true,
          },
        },
      },
    });

    // Get the Plaid account metadata for additional info (only if Plaid is enabled)
    let plaidAccounts: any[] = [];
    if (isPlaidEnabled) {
      plaidAccounts = z
        .array(plaidAccountSchema)
        .parse(user.settings.plaid.metadata?.accounts || []);
    }

    const syncedAccountsWithMetadata = syncedAccounts.map((account) => {
      const plaidAccount = plaidAccounts.find(
        (pa) => pa.id === account.plaidId
      );
      return {
        ...account,
        plaidAccount,
      };
    });

    return {
      accounts: syncedAccountsWithMetadata,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
