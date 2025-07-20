import postmarkapp from "postmark";
import env from "~/server/env";

export const postmarkClient = new postmarkapp.Client(env.POSTMARK_SERVER_TOKEN);
