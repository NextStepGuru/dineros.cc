import { Configuration, PlaidEnvironments } from "plaid";
import env from "~/server/env";

if (!env) {
  throw new Error("Server env validation failed; cannot configure Plaid.");
}

export const configuration = new Configuration({
  basePath:
    env.DEPLOY_ENV === "production"
      ? PlaidEnvironments.production
      : PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID,
      "PLAID-SECRET": env.PLAID_SECRET,
      "Plaid-Version": "2020-09-14",
    },
  },
});
