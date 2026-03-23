/**
 * Typed helpers for E2E seed/cleanup HTTP calls (used by global setup/teardown).
 */

export async function postE2ESeed(
  baseURL: string,
  token: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(new URL("/api/e2e/seed", baseURL).toString(), {
    method: "POST",
    headers: { "x-e2e-token": token },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`E2E seed failed ${res.status}: ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function postE2ECleanup(
  baseURL: string,
  token: string,
): Promise<void> {
  const res = await fetch(new URL("/api/e2e/cleanup", baseURL).toString(), {
    method: "POST",
    headers: { "x-e2e-token": token },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`E2E cleanup failed ${res.status}: ${text}`);
  }
}
