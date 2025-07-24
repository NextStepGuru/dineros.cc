import dotenv from "dotenv";
import envSchema from "./envSchema";

dotenv.config();

export const getDbDecryptionKeyValues = (): string[] => {
  return Object.keys(process.env)
    .filter((key) => key.startsWith("DB_DECRYPTION_KEY"))
    .map((key) => process.env[key]!)
    .filter((value) => value !== undefined); // Ensure no undefined values
};

const dbDecryptionKeyValues = getDbDecryptionKeyValues();

if (process.env?.DB_ENCRYPTION_KEY) {
  dbDecryptionKeyValues.push(process.env.DB_ENCRYPTION_KEY);
}

process.env.DB_DECRYPTION_KEYS = dbDecryptionKeyValues.join(",");

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error("Environment variable validation failed");
}

export default parsedEnv.data;
