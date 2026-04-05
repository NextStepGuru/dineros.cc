import { prisma } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";
import { sendPlaidConnectionIssueEmailIfEligible } from "~/server/services/PlaidSyncNotificationService";

export async function markPlaidItemReauthRequired({
  itemId,
  reason,
}: {
  itemId: string;
  reason: string;
}): Promise<void> {
  const plaidItem = await prisma.plaidItem.findUnique({
    where: { itemId },
    select: { userId: true },
  });
  if (!plaidItem) return;

  const userRow = await prisma.user.findUnique({
    where: { id: plaidItem.userId },
  });
  if (!userRow) return;

  const settings = structuredClone(
    (userRow.settings ?? {}) as Record<string, unknown>,
  );
  const existingPlaid =
    typeof settings.plaid === "object" && settings.plaid !== null
      ? (settings.plaid as Record<string, unknown>)
      : {};
  const plaid = { ...existingPlaid, reauth_required: true };

  const emailSent = await sendPlaidConnectionIssueEmailIfEligible({
    userId: plaidItem.userId,
    itemId,
    webhookCode: reason,
  });
  if (emailSent) {
    plaid.lastConnectionIssueEmailAt = dateTimeService.toISOString();
  }
  settings.plaid = plaid;

  await prisma.user.update({
    where: { id: plaidItem.userId },
    data: { settings },
  });

  log({
    message: "Marked Plaid item as requiring re-authentication",
    data: { itemId, userId: plaidItem.userId, reason },
    level: "warn",
  });
}
