const COOKIE = "dineros_local_last_signup";

/** Local machine only: dev server or localhost / 127.0.0.1 (not staging/test deploys). */
export function isLocalLastSignupCookieAllowed(): boolean {
  if (import.meta.dev) return true;
  const host = import.meta.server
    ? useRequestURL().hostname
    : typeof window !== "undefined"
      ? window.location.hostname
      : "";
  return /^(localhost|127\.0\.0\.1)$/i.test(host);
}

export function saveLocalLastSignupCredentials(
  email: string,
  password: string,
): void {
  if (!import.meta.client || !isLocalLastSignupCookieAllowed()) return;
  const payload = encodeURIComponent(
    JSON.stringify({ email, password }),
  );
  document.cookie = `${COOKIE}=${payload}; Path=/; SameSite=Lax`;
}

export function readLocalLastSignupCredentials(): {
  email: string;
  password: string;
} | null {
  if (!import.meta.client || !isLocalLastSignupCookieAllowed()) return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  if (!match?.[1]) return null;
  try {
    const o = JSON.parse(decodeURIComponent(match[1])) as {
      email?: string;
      password?: string;
    };
    if (typeof o.email === "string" && typeof o.password === "string")
      return { email: o.email, password: o.password };
  } catch {
    /* ignore */
  }
  return null;
}
