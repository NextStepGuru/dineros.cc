import { z } from "zod";
import { publicProfileSchema } from "~/schema/zod";
import { isAdminEmail } from "~/server/lib/adminConfig";

export const userRoleSchema = z.enum(["USER", "ADMIN"]);

/** Relaxed email for DB rows (legacy values). Password is parsed then stripped from API output. */
export const userProfileFromDbSchema = publicProfileSchema.extend({
  email: z.string(),
  password: z.string().nullable().optional(),
  role: userRoleSchema.optional(),
});

export const sessionUserResponseSchema = userProfileFromDbSchema
  .omit({ password: true })
  .extend({
    role: userRoleSchema,
    isAdmin: z.boolean(),
  });

export type SessionUser = z.infer<typeof sessionUserResponseSchema>;

export function sessionUserFromDb(user: unknown): SessionUser {
  const profile = userProfileFromDbSchema.parse(user);
  const { password: _omitPassword, ...withoutPassword } = profile;
  const resolvedRole =
    profile.role ?? (isAdminEmail(profile.email) ? "ADMIN" : "USER");
  return sessionUserResponseSchema.parse({
    ...withoutPassword,
    role: resolvedRole,
    isAdmin: resolvedRole === "ADMIN",
  });
}
