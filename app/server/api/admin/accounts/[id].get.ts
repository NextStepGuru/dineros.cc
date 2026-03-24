import { createError } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { isAdminEmail } from "~/server/lib/adminConfig";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const id = event.context.params?.id;
    if (!id) {
      throw createError({ statusCode: 400, statusMessage: "Account id is required" });
    }

    const account = await prisma.account.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isArchived: true,
        isDefault: true,
        lastAccessedAt: true,
        updatedAt: true,
        userAccounts: {
          orderBy: { userId: "asc" },
          select: {
            id: true,
            userId: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                isArchived: true,
              } as any,
            },
          },
        },
      },
    });

    if (!account) {
      throw createError({ statusCode: 404, statusMessage: "Account not found" });
    }

    return {
      id: account.id,
      name: account.name,
      isArchived: account.isArchived,
      isDefault: account.isDefault,
      lastAccessedAt: account.lastAccessedAt,
      updatedAt: account.updatedAt,
      members: account.userAccounts.map((membership) => ({
        membershipId: membership.id,
        userId: membership.userId,
        updatedAt: membership.updatedAt,
        user: {
          id: membership.user.id,
          firstName: membership.user.firstName,
          lastName: membership.user.lastName,
          email: membership.user.email,
          role:
            membership.user.role === "ADMIN" || isAdminEmail(membership.user.email)
              ? "ADMIN"
              : "USER",
          isArchived: membership.user.isArchived,
        },
      })),
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
