import { z } from "zod";
import { publicProfileSchema } from "~/schema/zod";
import { isAdminEmail } from "~/server/lib/adminConfig";

export const userRoleSchema = z.enum(["USER", "ADMIN"]);

/** Relaxed email for DB rows (legacy values). */
export const userProfileFromDbSchema = publicProfileSchema.extend({
  email: z.string(),
  role: userRoleSchema.optional(),
});

export const sessionUserResponseSchema = userProfileFromDbSchema.extend({
  role: userRoleSchema,
  isAdmin: z.boolean(),
});

export type SessionUser = z.infer<typeof sessionUserResponseSchema>;

export function sessionUserFromDb(user: unknown): SessionUser {
  const profile = userProfileFromDbSchema.parse(user);
  const resolvedRole = profile.role ?? (isAdminEmail(profile.email) ? "ADMIN" : "USER");
  return sessionUserResponseSchema.parse({
    ...profile,
    role: resolvedRole,
    isAdmin: resolvedRole === "ADMIN",
  });
}
