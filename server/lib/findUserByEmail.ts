import { createHash } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "~/server/clients/prismaClient";

/** Resolves a user by email with the same fallbacks as login (casing / hash). */
export async function findUserByEmail(email: string): Promise<User | null> {
  const trimmed = email.trim();
  const lower = trimmed.toLowerCase();
  const hashedEmail = createHash("sha512").update(trimmed, "utf8").digest("hex");
  const lowerCaseHashedEmail =
    lower === trimmed
      ? hashedEmail
      : createHash("sha512").update(lower, "utf8").digest("hex");

  let lookup = await prisma.user.findUnique({
    where: { email: trimmed },
  });

  if (!lookup) {
    lookup = await prisma.user.findFirst({
      where: { email: trimmed },
    });
  }

  if (!lookup) {
    lookup = await prisma.user.findUnique({
      where: { emailHash: hashedEmail },
    });
  }

  if (!lookup && lower !== trimmed) {
    lookup = await prisma.user.findUnique({
      where: { email: lower },
    });
  }

  if (!lookup && lowerCaseHashedEmail !== hashedEmail) {
    lookup = await prisma.user.findUnique({
      where: { emailHash: lowerCaseHashedEmail },
    });
  }

  return lookup;
}
