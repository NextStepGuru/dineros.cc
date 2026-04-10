/**
 * Normalize Plaid/axios-style errors from the Plaid Node SDK for logging and alerting.
 */
export type PlaidErrorInfo = {
  message: string;
  httpStatus: number | null;
  errorCode: string | null;
  errorType: string | null;
};

const CREDENTIAL_ERROR_CODES = new Set([
  "INVALID_CLIENT_ID",
  "INVALID_SECRET",
  "INVALID_ACCESS_TOKEN",
]);

export function extractPlaidErrorInfo(err: unknown): PlaidErrorInfo {
  let message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  let httpStatus: number | null = null;
  let errorCode: string | null = null;
  let errorType: string | null = null;

  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if ("status" in o && typeof o.status === "number") {
      httpStatus = o.status;
    }
    const response = o.response as
      | { status?: number; data?: Record<string, unknown> }
      | undefined;
    if (
      httpStatus === null &&
      response &&
      typeof response.status === "number"
    ) {
      httpStatus = response.status;
    }
    if (response?.data && typeof response.data === "object") {
      const d = response.data as Record<string, unknown>;
      if (typeof d.error_message === "string" && d.error_message.length > 0) {
        message = d.error_message;
      }
      if (typeof d.error_code === "string") errorCode = d.error_code;
      if (typeof d.error_type === "string") errorType = d.error_type;
    }
    if ("data" in o && o.data && typeof o.data === "object") {
      const d = o.data as Record<string, unknown>;
      if (typeof d.error_message === "string" && d.error_message.length > 0) {
        message = d.error_message;
      }
      if (typeof d.error_code === "string") errorCode = errorCode ?? d.error_code;
      if (typeof d.error_type === "string") errorType = errorType ?? d.error_type;
    }
  }

  return { message, httpStatus, errorCode, errorType };
}

export function isPlaidCredentialClassError(info: PlaidErrorInfo): boolean {
  if (info.httpStatus === 401 || info.httpStatus === 403) return true;
  if (info.errorCode && CREDENTIAL_ERROR_CODES.has(info.errorCode)) return true;
  return false;
}
