/**
 * Resets User email and password for all users after a DB restore so login works
 * with the local DB_ENCRYPTION_KEY. Run after scripts/dump-and-restore.sh.
 * Requires .env with DATABASE_URL and DB_ENCRYPTION_KEY (local).
 *
 * First user gets email dev@local.dev; others get dev-{id}@local.dev.
 * All get the same password (env RESTORE_DEV_PASSWORD or "dev").
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

  for (let i = 0; i < ids.length; i++) {
    const id = Number(ids[i].id);
    const email =
      i === 0 ? "dev@local.dev" : `dev-${id}@local.dev`;
    await prisma.user.update({
      where: { id },
      data: { email, password: hashedPassword },
    });
  }

  console.log(
    `Reset email/password for ${ids.length} user(s). Login with dev@local.dev / ${password} (or dev-{id}@local.dev for others).`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
