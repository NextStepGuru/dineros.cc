import env from "~/server/env";

/** Single allowed admin identity (logical role; not stored on user row). */
export const ADMIN_EMAIL =
  typeof env?.ADMIN_EMAIL === "string" && env.ADMIN_EMAIL.trim().length > 0
    ? env.ADMIN_EMAIL
    : "admin@dineros.cc";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
}
