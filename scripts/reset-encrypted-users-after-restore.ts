/**
 * Post-restore script: resets encrypted fields so local app works with local
 * DB_ENCRYPTION_KEY. Run after scripts/dump-and-restore.sh.
 * Requires .env with DATABASE_URL and DB_ENCRYPTION_KEY (local).
 *
 * 1. User: each user dev-{id}@local.dev; password from
 *    RESTORE_DEV_PASSWORD or "dev".
 * 2. AccountRegister: nulls Plaid fields (plaid_id, plaid_access_token, etc.)
 *    so reads/updates no longer trigger decryption errors; Plaid links must be
 *    re-linked locally. Skipped if table/columns missing (e.g. older restore).
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import HashService from "../server/services/HashService";

dotenv.config();

const encryptionKey = process.env.DB_ENCRYPTION_KEY;
if (!encryptionKey) {
  console.error("DB_ENCRYPTION_KEY is required. Set it in .env.");
  process.exit(1);
}

const prisma = new PrismaClient().$extends(
  fieldEncryptionExtension({
    encryptionKey,
    decryptionKeys: [encryptionKey],
  })
);

async function main() {
  const ids = await prisma.$queryRaw<{ id: bigint }[]>`SELECT id FROM user`;
  if (ids.length === 0) {
    console.log("No users to reset.");
    return;
  }

  const password = process.env.RESTORE_DEV_PASSWORD ?? "dev";
  const hashedPassword = await new HashService().hash(password);

  const sortedIds = [...ids].map((r) => Number(r.id)).sort((a, b) => a - b);
  for (let i = 0; i < sortedIds.length; i++) {
    const id = sortedIds[i];
    const email = i === 0 ? "dev@local.dev" : `dev-${id}@local.dev`;
    await prisma.user.update({
      where: { id },
      data: { email, password: hashedPassword },
    });
  }

  console.log(
    `Reset email/password for ${sortedIds.length} user(s). Login with dev@local.dev / ${password} (or dev-{id}@local.dev for additional users).`
  );

  // Null Plaid-related encrypted columns on account_register so decryption is never needed.
  // Schema: AccountRegister @@map("account_register"), plaidId->plaid_id, plaidAccessToken->plaid_access_token, etc.
  try {
    const ar = await prisma.$executeRaw`
      UPDATE account_register
      SET plaid_id = NULL, plaid_access_token = NULL,
          plaid_access_token_hash = NULL, plaid_id_hash = NULL
    `;
    console.log(
      `Cleared Plaid encrypted fields on account_register: ${ar} row(s). Re-link Plaid in local if needed.`
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unknown column") || msg.includes("doesn't exist")) {
      console.log("Skipped clearing account_register Plaid fields (columns or table missing).");
    } else {
      throw e;
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
