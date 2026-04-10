import { Configuration, PlaidEnvironments } from "plaid";
import env from "~/server/env";

if (!env) {
  throw new Error("Server env validation failed; cannot configure Plaid.");
}

function plaidBasePath(): string {
  if (env.PLAID_API_HOST === "production") {
    return PlaidEnvironments.production;
  }
  if (env.PLAID_API_HOST === "sandbox") {
    return PlaidEnvironments.sandbox;
  }
  return env.DEPLOY_ENV === "production"
    ? PlaidEnvironments.production
    : PlaidEnvironments.sandbox;
}

export const configuration = new Configuration({
  basePath: plaidBasePath(),
  apiKey: (header: string) => {
    switch (header) {
      case "PLAID-CLIENT-ID":
        return env.PLAID_CLIENT_ID;
      case "PLAID-SECRET":
        return env.PLAID_SECRET;
      case "Plaid-Version":
        return "2020-09-14";
      default:
        return "";
    }
  },
});
