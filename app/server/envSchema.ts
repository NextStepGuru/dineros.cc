import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test", "local"]),
  DEPLOY_ENV: z.enum(["staging", "production", "local"]).default("production"),
  DB_ENCRYPTION_KEY: z.string(),
  DB_DECRYPTION_KEYS: z.string().transform((a: string) => a.split(",")),
  PLAID_CLIENT_ID: z.string(),
  PLAID_SECRET: z.string(),
  /** Plaid webhook URL (e.g. https://your-domain.com/api/webhook/plaid). Optional; if unset, link token is created without webhook. */
  PLAID_WEBHOOK_URL: z.url().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional().default(""),
  /** BCC on signup welcome email (Postmark); comma-separated for multiple */
  SIGNUP_WELCOME_BCC: z.string().optional().default("jeremy@nextstep.guru"),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z
    .string()
    .transform((val: string) => Number.parseInt(val, 10))
    .default(6379),
  NATS_URL: z.string().default("nats://localhost:4222"),
  INTERNAL_API_TOKEN: z.string().optional(),
  NUXT_PUBLIC_SITE_URL: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0 ? undefined : value,
    z.url().optional(),
  ),
  WEBAUTHN_RP_ID: z.string().optional(),
  WEBAUTHN_RP_NAME: z.string().default("Dineros.cc"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(), // Optional, in case the key file is used locally
  TEST_DATE: z.string().optional(),
  TEST_TIMEZONE: z.string().optional(),
  /** OpenAI API key; if unset, Plaid transaction enrichment is skipped. */
  OPENAI_API_KEY: z.string().optional(),
  /** Model for Plaid register-entry enrichment (default gpt-5-nano). */
  OPENAI_PLAID_TX_MODEL: z.string().default("gpt-5-nano"),
  /** Model for vehicle value estimate (default gpt-5-nano). */
  OPENAI_VEHICLE_VALUE_MODEL: z.string().default("gpt-5-nano"),
});

export default envSchema;
