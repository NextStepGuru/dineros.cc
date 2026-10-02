import { describe, it, expect } from "vitest";
import {
  extractPlaidErrorInfo,
  isPlaidCredentialClassError,
} from "../plaidApiError";

describe("extractPlaidErrorInfo", () => {
  it("extracts message from an Error instance", () => {
    const info = extractPlaidErrorInfo(new Error("something broke"));
    expect(info).toEqual({
      message: "something broke",
      httpStatus: null,
      errorCode: null,
      errorType: null,
    });
  });

  it("uses the string itself for string errors", () => {
    const info = extractPlaidErrorInfo("plaid is down");
    expect(info.message).toBe("plaid is down");
    expect(info.httpStatus).toBeNull();
    expect(info.errorCode).toBeNull();
    expect(info.errorType).toBeNull();
  });

  it("stringifies non-string primitives", () => {
    expect(extractPlaidErrorInfo(42).message).toBe("42");
    expect(extractPlaidErrorInfo(null).message).toBe("null");
    expect(extractPlaidErrorInfo(undefined).message).toBe("undefined");
  });

  it("reads httpStatus from a top-level status property", () => {
    const err = new Error("rate limited");
    (err as any).status = 429;
    const info = extractPlaidErrorInfo(err);
    expect(info.httpStatus).toBe(429);
    expect(info.message).toBe("rate limited");
  });

  it("falls back to response.status when top-level status is absent", () => {
    const info = extractPlaidErrorInfo({
      response: { status: 400, data: {} },
      message: "bad request",
    });
    expect(info.httpStatus).toBe(400);
  });

  it("prefers the top-level status over response.status", () => {
    const info = extractPlaidErrorInfo({
      status: 402,
      response: { status: 500, data: {} },
    });
    expect(info.httpStatus).toBe(402);
  });

  it("does not treat non-numeric status values as HTTP status", () => {
    const info = extractPlaidErrorInfo({ status: "429" });
    expect(info.httpStatus).toBeNull();
  });

  it("extracts Plaid error fields from response.data and overrides the message", () => {
    const info = extractPlaidErrorInfo({
      message: "Request failed with status code 400",
      response: {
        status: 400,
        data: {
          error_message: "the access token is expired",
          error_code: "INVALID_ACCESS_TOKEN",
          error_type: "ITEM_ERROR",
        },
      },
    });
    expect(info.message).toBe("the access token is expired");
    expect(info.httpStatus).toBe(400);
    expect(info.errorCode).toBe("INVALID_ACCESS_TOKEN");
    expect(info.errorType).toBe("ITEM_ERROR");
  });

  it("extracts Plaid error fields from a top-level data object", () => {
    const info = extractPlaidErrorInfo({
      data: {
        error_message: "client id not found",
        error_code: "INVALID_CLIENT_ID",
        error_type: "INVALID_REQUEST",
      },
    });
    expect(info.message).toBe("client id not found");
    expect(info.errorCode).toBe("INVALID_CLIENT_ID");
    expect(info.errorType).toBe("INVALID_REQUEST");
  });

  it("keeps the original message when error_message is empty", () => {
    const err = new Error("original failure");
    (err as any).response = { status: 500, data: { error_message: "" } };
    const info = extractPlaidErrorInfo(err);
    expect(info.message).toBe("original failure");
    expect(info.httpStatus).toBe(500);
  });

  it("does not overwrite an errorCode already found in response.data", () => {
    const info = extractPlaidErrorInfo({
      response: {
        status: 400,
        data: { error_code: "NO_ACCOUNTS", error_type: "ITEM_ERROR" },
      },
      data: { error_code: "OTHER_CODE", error_type: "OTHER_TYPE" },
    });
    expect(info.errorCode).toBe("NO_ACCOUNTS");
    expect(info.errorType).toBe("ITEM_ERROR");
  });

  it("ignores non-string error_code / error_type values", () => {
    const info = extractPlaidErrorInfo({
      response: { status: 400, data: { error_code: 123, error_type: null } },
    });
    expect(info.errorCode).toBeNull();
    expect(info.errorType).toBeNull();
  });
});

describe("isPlaidCredentialClassError", () => {
  it("flags 401 responses as credential errors", () => {
    expect(
      isPlaidCredentialClassError({
        message: "unauthorized",
        httpStatus: 401,
        errorCode: null,
        errorType: null,
      }),
    ).toBe(true);
  });

  it("flags 403 responses as credential errors", () => {
    expect(
      isPlaidCredentialClassError({
        message: "forbidden",
        httpStatus: 403,
        errorCode: null,
        errorType: null,
      }),
    ).toBe(true);
  });

  it("flags known credential error codes", () => {
    for (const code of [
      "INVALID_CLIENT_ID",
      "INVALID_SECRET",
      "INVALID_ACCESS_TOKEN",
    ]) {
      expect(
        isPlaidCredentialClassError({
          message: "err",
          httpStatus: null,
          errorCode: code,
          errorType: "ITEM_ERROR",
        }),
      ).toBe(true);
    }
  });

  it("does not flag unrelated codes or statuses", () => {
    expect(
      isPlaidCredentialClassError({
        message: "rate limited",
        httpStatus: 429,
        errorCode: "RATE_LIMIT",
        errorType: "PLANNED_DOWNTIME_ERROR",
      }),
    ).toBe(false);
    expect(
      isPlaidCredentialClassError({
        message: "err",
        httpStatus: null,
        errorCode: null,
        errorType: null,
      }),
    ).toBe(false);
    expect(
      isPlaidCredentialClassError({
        message: "err",
        httpStatus: 200,
        errorCode: "PRODUCT_NOT_READY",
        errorType: "ITEM_ERROR",
      }),
    ).toBe(false);
  });

  it("flags credential error codes regardless of HTTP status", () => {
    expect(
      isPlaidCredentialClassError({
        message: "err",
        httpStatus: 500,
        errorCode: "INVALID_SECRET",
        errorType: null,
      }),
    ).toBe(true);
  });
});
