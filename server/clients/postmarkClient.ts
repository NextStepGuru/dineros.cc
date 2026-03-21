import postmarkapp from "postmark";
import env from "~/server/env";

// Strip surrounding quotes (Docker --env-file can leave them in the value)
const raw = env?.POSTMARK_SERVER_TOKEN?.trim() ?? "";
const token = raw.replaceAll(/^["']|["']$/g, "");
export const hasPostmarkToken = Boolean(token);
export const postmarkClient: postmarkapp.Client = hasPostmarkToken
  ? new postmarkapp.Client(token)
  : ({
      sendEmail: async () => {},
      sendEmailBatch: async () => [],
    } as unknown as postmarkapp.Client);
