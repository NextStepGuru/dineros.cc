import { createId } from "@paralleldrive/cuid2";
import { prisma } from "~/server/clients/prismaClient";

/** Invalidates existing JWTs signed before this update (jwt claim must match `User.jwtKey`). */
export async function rotateUserJwtKey(userId: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { jwtKey: createId() },
  });
}
