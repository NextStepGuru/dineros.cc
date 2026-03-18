import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test", "local"]),
  DEPLOY_ENV: z.enum(["staging", "production", "local"]).default("production"),
  DB_ENCRYPTION_KEY: z.string(),
  DB_DECRYPTION_KEYS: z.string().transform((a) => a.split(",")),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default(6379),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default(3000),
});

export default envSchema;
