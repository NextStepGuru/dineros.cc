import { createError, getRouterParam, readBody } from "h3";
import { prisma } from "~/server/clients/prismaClient";
import HashService from "~/server/services/HashService";
import { adminUserPasswordResetSchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const rawId = getRouterParam(event, "id");
    const userId = rawId ? Number.parseInt(rawId, 10) : Number.NaN;
    if (!Number.isInteger(userId) || userId < 1) {
      throw createError({ statusCode: 400, statusMessage: "Invalid user id" });
    }

    const body = await readBody(event);
    const { newPassword } = adminUserPasswordResetSchema.parse(body);
    const password = await new HashService().hash(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password },
      select: { id: true },
    });

    return { message: "Password reset successfully." };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
