/**
 * Post-restore script: resets encrypted fields so local app works with local
 * DB_ENCRYPTION_KEY. Run after scripts/dump-and-restore.sh.
 * Requires .env with DATABASE_URL and DB_ENCRYPTION_KEY (local).
 *
 * 1. User: each user dev-{id}@local.dev; password from
 *    RESTORE_DEV_PASSWORD or "dev".
 * 2. Null Plaid encrypted columns (account_register, register_entry) so updates don't fail on production ciphertext.
 * 3. AccountRegister: sets name to Register-{id} (encrypted with local key).
 * 4. RegisterEntry: sets description to "Entry {id}" (encrypted with local key).
 *    Skipped if table/column missing (e.g. older restore).
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

  // Clear Plaid encrypted columns first so updates below don't trigger decryption of production ciphertext.
  try {
    await prisma.$executeRaw`
      UPDATE account_register
      SET plaid_id = NULL, plaid_access_token = NULL,
          plaid_access_token_hash = NULL, plaid_id_hash = NULL
    `;
    await prisma.$executeRaw`
      UPDATE register_entry SET plaid_id = NULL, plaid_id_hash = NULL
    `;
    console.log("Cleared Plaid encrypted fields on account_register and register_entry.");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unknown column") || msg.includes("doesn't exist")) {
      console.log("Skipped clearing Plaid fields (columns or table missing).");
    } else {
      throw e;
    }
  }

  const registers = await prisma.accountRegister.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const r of registers) {
    await prisma.accountRegister.update({
      where: { id: r.id },
      data: { name: `Register-${r.id}` },
    });
  }
  if (registers.length > 0) {
    console.log(`Reset name for ${registers.length} account register(s) to Register-{id}.`);
  }

  try {
    const entries = await prisma.registerEntry.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const e of entries) {
      await prisma.registerEntry.update({
        where: { id: e.id },
        data: { description: `Entry ${e.id}` },
      });
    }
    if (entries.length > 0) {
      console.log(`Reset description for ${entries.length} register entry(ies) to "Entry {id}".`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unknown column") || msg.includes("doesn't exist")) {
      console.log("Skipped resetting register_entry description (column or table missing).");
    } else {
      throw e;
    }
  }

  console.log("Re-link Plaid in local if needed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
