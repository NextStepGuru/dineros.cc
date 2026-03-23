import { createError, getRouterParam, readBody } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import { adminUserUpdateSchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";
import { isAdminEmail } from "~/server/lib/adminConfig";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const rawId = getRouterParam(event, "id");
    const userId = rawId ? Number.parseInt(rawId, 10) : Number.NaN;
    if (!Number.isInteger(userId) || userId < 1) {
      throw createError({ statusCode: 400, statusMessage: "Invalid user id" });
    }

    const body = await readBody(event);
    const data = adminUserUpdateSchema.parse(body);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isArchived: true,
        countryId: true,
        timezoneOffset: true,
        isDaylightSaving: true,
        updatedAt: true,
      } as any,
    });

    return {
      id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      role:
        (updatedUser as any).role === "ADMIN" || isAdminEmail(updatedUser.email)
          ? "ADMIN"
          : "USER",
      isArchived: Boolean(updatedUser.isArchived),
      countryId: updatedUser.countryId ?? null,
      timezoneOffset: updatedUser.timezoneOffset ?? null,
      isDaylightSaving: updatedUser.isDaylightSaving ?? null,
      updatedAt: updatedUser.updatedAt,
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
