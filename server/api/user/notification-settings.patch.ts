import { z } from "zod";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { sessionUserFromDb } from "~/server/lib/sessionUserProfile";

const bodySchema = z
  .object({
    plaidTransactionSyncEmail: z.boolean().optional(),
    plaidConnectionIssueEmail: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.plaidTransactionSyncEmail !== undefined ||
      d.plaidConnectionIssueEmail !== undefined,
    { message: "At least one notification field is required" },
  );

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const body = await readBody(event);
    const { plaidTransactionSyncEmail, plaidConnectionIssueEmail } =
      bodySchema.parse(body);

    const user = await PrismaDb.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const settings = structuredClone(
      (user.settings ?? {}) as Record<string, unknown>,
    );
    const existingPlaid =
      typeof settings.plaid === "object" && settings.plaid !== null
        ? (settings.plaid as Record<string, unknown>)
        : {};
    settings.plaid = {
      ...existingPlaid,
      ...(plaidTransactionSyncEmail !== undefined && {
        transactionSyncEmail: plaidTransactionSyncEmail,
      }),
      ...(plaidConnectionIssueEmail !== undefined && {
        connectionIssueEmail: plaidConnectionIssueEmail,
      }),
    };

    const updated = await PrismaDb.user.update({
      where: { id: userId },
      data: { settings },
    });

    return sessionUserFromDb(updated);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
