import { z } from "zod";
import { publicProfileSchema } from "~/schema/zod";
import { isAdminEmail } from "~/server/lib/adminConfig";

/** Relaxed email for DB rows (legacy values). */
export const userProfileFromDbSchema = publicProfileSchema.extend({
  email: z.string(),
});

export const sessionUserResponseSchema = userProfileFromDbSchema.extend({
  isAdmin: z.boolean(),
});

export type SessionUser = z.infer<typeof sessionUserResponseSchema>;

export function sessionUserFromDb(user: unknown): SessionUser {
  const profile = userProfileFromDbSchema.parse(user);
  return sessionUserResponseSchema.parse({
    ...profile,
    isAdmin: isAdminEmail(profile.email),
  });
}
