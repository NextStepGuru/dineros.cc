import { readRawBody, getHeader, createError } from "h3";
import { PlaidApi } from "plaid";
import { configuration } from "~/server/lib/getPlaidClient";
import { verifyPlaidWebhook } from "~/server/lib/plaidWebhook";
import { log } from "~/server/logger";
import { addPlaidSyncJob } from "~/server/clients/queuesClient";
import { markPlaidItemReauthRequired } from "~/server/services/plaidReauthService";

interface PlaidWebhookBody {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  [key: string]: unknown;
}

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event);
  const verificationHeader = getHeader(event, "plaid-verification");

  const plaidClient = new PlaidApi(configuration);
  const result = await verifyPlaidWebhook(
    plaidClient,
    rawBody ?? "",
    verificationHeader,
  );

  if (!result.valid) {
    log({
      message: "Plaid webhook verification failed",
      level: "warn",
      data: {
        hasHeader: Boolean(verificationHeader),
        hasBody: Boolean(rawBody),
      },
    });
    throw createError({
      statusCode: 401,
      statusMessage: "Webhook verification failed",
    });
  }

  const body: PlaidWebhookBody = rawBody
    ? (JSON.parse(rawBody) as PlaidWebhookBody)
    : {};
  log({ message: "Plaid webhook verified", data: body, level: "info" });

  const webhookType = body.webhook_type;
  const webhookCode = body.webhook_code;
  const itemId = body.item_id;

  // SYNC_UPDATES_AVAILABLE (Transactions Sync) or DEFAULT_UPDATE / INITIAL_UPDATE / HISTORICAL_UPDATE (transactions/get)
  if (
    webhookType === "TRANSACTIONS" &&
    itemId &&
    (webhookCode === "SYNC_UPDATES_AVAILABLE" ||
      webhookCode === "DEFAULT_UPDATE" ||
      webhookCode === "INITIAL_UPDATE" ||
      webhookCode === "HISTORICAL_UPDATE")
  ) {
    try {
      await addPlaidSyncJob(
        {
          name: "Plaid webhook SYNC_UPDATES_AVAILABLE",
          itemId,
        },
        { delay: 0 },
      );
    } catch (error) {
      log({
        message: "Failed to enqueue Plaid webhook sync job",
        level: "error",
        data: { itemId, webhookType, webhookCode, error },
      });
      throw createError({
        statusCode: 503,
        statusMessage: "Queue unavailable",
        message: "Could not enqueue Plaid sync job",
      });
    }
  }

  // Item errors: user may need to re-link
  if (
    webhookType === "ITEM" &&
    itemId &&
    (webhookCode === "ERROR" ||
      webhookCode === "LOGIN_REQUIRED" ||
      webhookCode === "ITEM_LOGIN_REQUIRED")
  ) {
    await markPlaidItemReauthRequired({
      itemId,
      reason: String(webhookCode),
    });
  }

  return {};
});
