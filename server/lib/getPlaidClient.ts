import { Configuration, PlaidEnvironments } from "plaid";
import env from "~/server/env";

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
