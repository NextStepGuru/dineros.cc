#!/usr/bin/env node

import { execSync } from "child_process";
import { setTimeout } from "timers/promises";

const MAX_RETRIES = 1;
const RETRY_DELAY = 2000; // 2 seconds

async function runMigration() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Migration] Attempt ${attempt}/${MAX_RETRIES}: Running Prisma migration...`
      );
      execSync("npx prisma migrate deploy", {
        stdio: "inherit",
        env: { ...process.env, FORCE_COLOR: "1" },
      });
      console.log("[Migration] ✅ Successfully completed database migration");
      return true;
    } catch (error) {
      console.error(`[Migration] ❌ Attempt ${attempt} failed:`, error.message);

      if (attempt < MAX_RETRIES) {
        console.log(
          `[Migration] ⏳ Retrying in ${RETRY_DELAY / 1000} seconds...`
        );
        await setTimeout(RETRY_DELAY);
      } else {
        console.error(
          "[Migration] 💥 All migration attempts failed. Continuing with startup..."
        );
        console.error(
          "[Migration] ⚠️  The application may not function correctly without proper database schema."
        );
        return false;
      }
    }
  }
}

// Run the migration
runMigration().catch((error) => {
  console.error("[Migration] 💥 Unexpected error during migration:", error);
  console.error("[Migration] ⚠️  Continuing with startup...");
  process.exit(0); // Exit with success to allow startup to continue
});
