import { setCookie } from "h3";
import { publicProfileSchema } from "~/schema/zod";
import { prisma } from "~/server/clients/prismaClient";
import env from "~/server/env";
import JwtService from "~/server/services/JwtService";
import { dateTimeService } from "~/server/services/forecast";

export async function completeLogin(event: any, userId: number) {
  const jwt = new JwtService();
  const token = await jwt.sign({ userId });

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { lastAccessedAt: dateTimeService.nowDate() },
  });

  setCookie(event, "authToken", token, {
    secure: env?.NODE_ENV === "production",
    maxAge: 86400,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
  });

  return { token, message: null, user: publicProfileSchema.parse(updatedUser) };
}
