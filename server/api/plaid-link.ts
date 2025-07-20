import { PlaidApi, Products, CountryCode } from "plaid";
import { getUser } from "../lib/getUser";
import { configuration } from "../lib/getPlaidClient";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  const user = getUser(event);

  try {
    const client = new PlaidApi(configuration);

    const createTokenResponse = await client.linkTokenCreate({
      user: {
        client_user_id: user.userId.toString(),
      },
      client_name: "Dineros.cc",
      products: [Products.Transactions],
      language: "en",
      country_codes: [CountryCode.Us],
    });

    return createTokenResponse.data;
  } catch (error) {
    handleApiError(error);

    throw new Error("Failed to create Plaid Link token");
  }
});
