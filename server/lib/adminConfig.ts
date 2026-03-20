/** Single allowed admin identity (logical role; not stored on user row). */
export const ADMIN_EMAIL = "jeremy@lunarfly.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
}
