import type { EventHandlerRequest, H3Event } from "h3";
import { createError } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { getUser } from "~/server/lib/getUser";
import { isAdminEmail } from "~/server/lib/adminConfig";

export async function requireAdmin(event: H3Event<EventHandlerRequest>) {
  const { userId } = getUser(event);
  const user = (await prisma.user.findUnique({
    where: { id: userId },
  })) as { role?: string | null; email?: string | null } | null;
  const role = typeof user?.role === "string" ? user.role : null;
  const isAdmin = role === "ADMIN" || isAdminEmail(user?.email);
  if (!isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden",
    });
  }
}
