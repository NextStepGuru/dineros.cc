import type { z } from "zod";
import type { privateUserSchema } from "~/schema/zod";
import { prisma } from "~/server/clients/prismaClient";

type PrivateUser = z.infer<typeof privateUserSchema>;

/**
 * Plaid flows store `settings.plaid.isEnabled` for API gating. Some paths incorrectly
 * cleared it; `plaid_item` is the durable signal that Link completed for this user.
 */
export async function plaidIsActiveForUser(
  userId: number,
  user: PrivateUser,
): Promise<boolean> {
  if (user.settings.plaid.isEnabled) return true;
  const row = await prisma.plaidItem.findFirst({
    where: { userId },
    select: { itemId: true },
  });
  return row != null;
}
