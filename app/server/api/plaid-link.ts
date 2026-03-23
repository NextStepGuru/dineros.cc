import { PlaidApi, Products, CountryCode } from "plaid";
import { getUser } from "../lib/getUser";
import { configuration } from "../lib/getPlaidClient";
import { handleApiError } from "~/server/lib/handleApiError";
import env from "~/server/env";

export default defineEventHandler(async (event) => {
  const user = getUser(event);

  try {
    const client = new PlaidApi(configuration);

    const baseUrl = env?.NUXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    const webhookUrl =
      env?.PLAID_WEBHOOK_URL ?? (baseUrl ? `${baseUrl}/api/webhook/plaid` : undefined);

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
    handleApiError(error);

    throw new Error("Failed to create Plaid Link token");
  }
});
