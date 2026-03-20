type ApiLikeError = {
  data?: unknown;
  statusMessage?: string;
  statusCode?: number;
  message?: string;
};

function statusMessageFromData(data: unknown): string | undefined {
  if (data && typeof data === "object" && "statusMessage" in data) {
    const s = (data as { statusMessage?: unknown }).statusMessage;
    return typeof s === "string" ? s : undefined;
  }
  return undefined;
}

/** True for ofetch-style messages that embed method, URL, or fetch internals. */
function isTechnicalClientMessage(msg: string): boolean {
  if (/^\s*\[([A-Z]+)\]/i.test(msg)) return true;
  if (msg.includes("/api/")) return true;
  if (/<no response>/i.test(msg)) return true;
  return false;
}

/**
 * Turns $fetch / network errors into short copy for toasts and alerts.
 * Prefer server `statusMessage` when it looks intended for humans.
 */
export function userFriendlyApiError(
  error: unknown,
  contextFallback: string,
): string {
  const e = error as ApiLikeError;
  const fromData = statusMessageFromData(e?.data);
  const serverLine =
    (fromData && !isTechnicalClientMessage(fromData) ? fromData : undefined) ||
    (e?.statusMessage && !isTechnicalClientMessage(e.statusMessage)
      ? e.statusMessage
      : undefined);

  if (serverLine) return serverLine;

  const code = e?.statusCode;
  if (code === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (code === 403) {
    return "You don’t have permission to do that.";
  }
  if (code === 404) {
    return "We couldn’t find what you asked for.";
  }
  if (code === 400 || code === 422) {
    const raw =
      fromData ||
      (typeof e?.statusMessage === "string" ? e.statusMessage : "") ||
      "";
    if (raw && !isTechnicalClientMessage(raw)) return raw;
    return "Something in your request wasn’t valid. Please check and try again.";
  }
  if (code != null && code >= 500) {
    return "Something went wrong on our end. Please try again in a moment.";
  }

  const msg = typeof e?.message === "string" ? e.message : "";
  if (
    /failed to fetch|networkerror|load failed|network request failed|aborted|abort|econnrefused|enotfound|etimedout|timeout/i.test(
      msg,
    )
  ) {
    return "We couldn’t reach the server. Check your internet connection and try again.";
  }
  if (isTechnicalClientMessage(msg)) {
    return contextFallback;
  }
  if (msg && msg.length > 0 && msg.length < 200) {
    return msg;
  }
  return contextFallback;
}
