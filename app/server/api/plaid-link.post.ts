import { getUser } from "../lib/getUser";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { configuration } from "../lib/getPlaidClient";
import { PlaidApi } from "plaid";
import { privateUserSchema, publicProfileSchema } from "~/schema/zod";
import { postmarkClient } from "../clients/postmarkClient";
import { plaidRootSchema } from "~/schema/plaid";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";
import { addPlaidSyncJob } from "~/server/clients/queuesClient";

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);

    const plaidBody = plaidRootSchema.parse(body);

    const lookup = await PrismaDb.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const user = privateUserSchema.parse(lookup);

    const client = new PlaidApi(configuration);

    if (!plaidBody.public_token) {
      throw new Error("Public token is required");
    }

    const results = await client.itemPublicTokenExchange({
      public_token: plaidBody.public_token,
    });

    const itemId = results.data.item_id;
    if (itemId) {
      await PrismaDb.plaidItem.upsert({
        where: { itemId },
        create: { itemId, userId },
        update: { userId, updatedAt: dateTimeService.now().toDate() },
      });
      addPlaidSyncJob({ name: "Initial Plaid sync after link", itemId });
    }

    const userResult = await PrismaDb.user.update({
      data: {
        settings: JSON.parse(
          JSON.stringify({
            ...user.settings,
            plaid: { ...plaidBody, ...results.data, isEnabled: true },
          }),
        ),
      },
      where: { id: userId },
    });

    await postmarkClient.sendEmail({
      From: "Mr. Pepe Dineros <pepe@dineros.cc>",
      To: userResult.email,
      Subject:
        "You have successfully connected your bank account(s) to Dineros!",
      HtmlBody: `${userResult.firstName},<br>
    <br>
    Congrats, You have successfully connected your bank account(s) with Plaid. Your transactions will appear within Dineros within the next few minutes. At any point you can disconnect your accounts by visiting your profile section within Dineros.cc.
    <br>
    As always, if you have any questions, please let me or my team know.
    <br>
    Regards,<br>
    &nbsp;&nbsp;Mr. Pepe &amp; The Dineros Team
    `,
    });

    return publicProfileSchema.parse(userResult);
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
