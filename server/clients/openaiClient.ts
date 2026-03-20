import OpenAI from "openai";
import env from "~/server/env";

let client: OpenAI | null | undefined;

/** Returns a shared OpenAI client when `OPENAI_API_KEY` is set; otherwise `null`. */
export function getOpenAIClient(): OpenAI | null {
  const key = env?.OPENAI_API_KEY?.trim();
  if (!key) {
    client = null;
    return null;
  }
  if (client === undefined) {
    client = new OpenAI({ apiKey: key });
  }
  return client;
}
