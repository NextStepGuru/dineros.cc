/**
 * Thin fetch wrapper for the dineros.cc API. Sends the JWT as
 * `Authorization: Bearer` — the server middleware prefers the header over
 * cookies, so no cookie handling is needed. On 401 it tries one sliding
 * refresh (GET /api/validate-token) before giving up and reporting the
 * session as expired.
 */

/**
 * Base URL of the dineros.cc API. Set EXPO_PUBLIC_API_URL="" (empty) for the
 * web dev demo: requests go out same-origin and metro.config.js proxies /api
 * to the backend, sidestepping browser CORS.
 */
export const apiBaseUrl = (
  process.env.EXPO_PUBLIC_API_URL ?? "https://dineros.cc"
)
  .trim()
  .replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ClientHooks = {
  getToken: () => Promise<string | null>;
  /** Sliding refresh via /api/validate-token; resolves false when it fails. */
  refresh: () => Promise<boolean>;
  /** Called when a request stays 401 after the refresh attempt. */
  onSessionExpired: () => void;
};

let hooks: ClientHooks = {
  getToken: async () => null,
  refresh: async () => false,
  onSessionExpired: () => {},
};

export function configureApiClient(next: ClientHooks): void {
  hooks = next;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

/**
 * Endpoints whose 401 is a credential error, not session expiry — the
 * refresh-and-retry path must not swallow their real error message.
 */
const NO_REFRESH_PATHS = ["/api/login", "/api/validate-token"];

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const data = (await res.json()) as {
      message?: string;
      errors?: string | string[];
      statusMessage?: string;
    };
    const detail = Array.isArray(data.errors)
      ? data.errors.join(", ")
      : data.errors ?? data.message ?? data.statusMessage;
    if (detail) message = detail;
  } catch {
    // non-JSON error body — keep the generic message
  }
  return new ApiError(res.status, message);
}

async function requestOnce<T>(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as T;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await requestOnce<T>(path, options, await hooks.getToken());
  } catch (error) {
    const refreshable =
      error instanceof ApiError &&
      error.status === 401 &&
      !NO_REFRESH_PATHS.some((p) => path.startsWith(p));
    if (refreshable) {
      const refreshed = await hooks.refresh();
      if (refreshed) {
        return requestOnce<T>(
          path,
          options,
          await hooks.getToken(),
        );
      }
      hooks.onSessionExpired();
      throw new ApiError(401, "Session expired. Please sign in again.");
    }
    throw error;
  }
}

export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
