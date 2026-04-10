import { createError } from "h3";
import { PlaidApi, Products, CountryCode } from "plaid";
import { getUser } from "../lib/getUser";
import { configuration } from "../lib/getPlaidClient";
import { handleApiError } from "~/server/lib/handleApiError";
import { extractPlaidErrorInfo } from "~/server/lib/plaidApiError";
import { buildAppUrl } from "~/server/lib/appUrl";
import { log } from "~/server/logger";
import { poolTimeoutHealthService } from "~/server/services/poolTimeoutHealthService";
import env from "~/server/env";

function resolveLinkTokenWebhookUrl(): string | undefined {
  const explicit = env?.PLAID_WEBHOOK_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const derived = buildAppUrl("/api/webhook/plaid");
  if (!derived) {
    return undefined;
  }
  try {
    const parsed = new URL(derived);
    if (parsed.protocol === "https:") {
      return derived;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export default defineEventHandler(async (event) => {
  const user = getUser(event);

  try {
    const client = new PlaidApi(configuration);

    const webhookUrl = resolveLinkTokenWebhookUrl();

    const createTokenResponse = await client.linkTokenCreate({
      user: {
        client_user_id: user.userId.toString(),
      },
      client_name: "Dineros.cc",
      products: [Products.Transactions],
      language: "en",
      country_codes: [CountryCode.Us],
      ...(webhookUrl && { webhook: webhookUrl }),
    });

    return createTokenResponse.data;
  } catch (error) {
    const info = extractPlaidErrorInfo(error);
    if (
      info.httpStatus !== null &&
      info.httpStatus >= 400 &&
      info.httpStatus < 600
    ) {
      poolTimeoutHealthService.record(error);
      log({
        message: "Plaid linkTokenCreate failed",
        level: "error",
        data: { ...info, userId: user.userId },
      });
      const isProd = process.env.NODE_ENV === "production";
      throw createError({
        statusCode: 500,
        statusMessage: isProd
          ? "Something went wrong"
          : error instanceof Error
            ? error.message
            : "Something went wrong",
      });
    }

    handleApiError(error);

    throw new Error("Failed to create Plaid Link token");
  }
});
