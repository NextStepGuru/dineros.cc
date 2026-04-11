import { getUser } from "../lib/getUser";
import { prisma } from "../clients/prismaClient";
import { z } from "zod";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { mapPlaidTypesToAccountTypes } from "~/lib/utils";
import { handleApiError } from "~/server/lib/handleApiError";
import { resolvePlaidAccessTokenFromStored } from "~/server/lib/plaidAccessTokenCrypto";
import { dateTimeService } from "~/server/services/forecast";
import { accountWhereUserIsMember } from "~/server/lib/accountAccess";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);

    await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const linkAccountSchema = z.object({
      linkAccounts: z.array(
        z.object({
          accountRegisterId: z.coerce.number(),
          plaidId: z.string(),
        })
      ),
    });
    const { linkAccounts } = linkAccountSchema.parse(body);

    const inAccountRegisterIds = linkAccounts
      .map((a) => a.accountRegisterId)
      .filter((id) => id > 0);

    // Ensure that the user has permission to link these accounts.
    if (inAccountRegisterIds.length) {
      const checkPermissions = await prisma.accountRegister.findMany({
        where: {
          id: {
            in: inAccountRegisterIds,
          },
          account: {
            userAccounts: {
              some: {
                userId,
              },
            },
          },
        },
      });

      if (checkPermissions.length !== inAccountRegisterIds.length) {
        throw new Error("You don't have permission to link these accounts.");
      }
    }

    const lookupUser = await prisma.user.findFirstOrThrow({
      where: {
        id: userId,
      },
    });

    const user = privateUserSchema.parse(lookupUser);

    for (const linkAccount of linkAccounts) {
      const lookupAccount = await prisma.account.findFirstOrThrow({
        where: {
          isDefault: true,
          isArchived: false,
          userAccounts: {
            some: {
              userId,
            },
          },
        },
      });

      const lookupBudget = await prisma.budget.findFirstOrThrow({
        where: {
          accountId: lookupAccount.id,
          isDefault: true,
          account: accountWhereUserIsMember(userId),
        },
      });

      const plaidAccounts = user.settings.plaid.metadata?.accounts || [];
      const plaidAccount = plaidAccounts.find(
        (a) => a.id === linkAccount.plaidId
      );
      const plaidAccessToken =
        resolvePlaidAccessTokenFromStored(user.settings.plaid.access_token) ??
        "";
      const plaidJson = {
        accessToken: plaidAccessToken,
        plaidAccount: plaidAccount || {},
      };

      if (linkAccount.accountRegisterId === 0) {
        await prisma.accountRegister.create({
          data: {
            plaidId: linkAccount.plaidId,
            plaidJson,
            plaidAccessToken,
            name: plaidAccount?.name || "Plaid Account Import",
            balance: 0,
            statementAt: dateTimeService.nowDate(),
            budget: {
              connect: {
                id: lookupBudget.id,
              },
            },
            type: {
              connect: {
                id: mapPlaidTypesToAccountTypes(plaidAccount?.type),
              },
            },
            account: {
              connect: {
                id: lookupAccount.id,
              },
            },
          },
        });
      } else if (linkAccount.accountRegisterId > 0) {
        await prisma.accountRegister.update({
          where: {
            id: linkAccount.accountRegisterId,
          },
          data: {
            plaidId: linkAccount.plaidId,
            plaidJson,
            plaidAccessToken,
          },
        });
      }
    }

    const settings = structuredClone(user.settings);
    settings.plaid.isEnabled = true;

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        settings,
      },
    });

    return publicProfileSchema.parse(updatedUser);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
