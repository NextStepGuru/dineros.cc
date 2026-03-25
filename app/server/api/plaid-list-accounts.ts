import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { privateUserSchema } from "~/schema/zod";
import { plaidAccountSchema } from "~/schema/plaid";
import { z } from "zod";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);

    const lookup = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);

    if (!user.settings.plaid.isEnabled) {
      throw new Error("Plaid is not enabled for this user.");
    }

    const plaidAccounts = await prisma.accountRegister.findMany({
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
      },
      select: {
        plaidId: true,
      },
    });

    const plaidIds = plaidAccounts.map((a) => a.plaidId).filter((a) => !!a);

    const accounts = z
      .array(plaidAccountSchema)
      .parse(user.settings.plaid.metadata?.accounts || [])
      .filter((a) => !plaidIds.includes(a.id));

    return {
      accounts,
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
