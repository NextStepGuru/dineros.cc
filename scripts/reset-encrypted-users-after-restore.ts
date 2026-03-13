/**
 * Post-restore script: re-encrypts or overwrites encrypted fields so local app
 * works with local DB_ENCRYPTION_KEY. Run after scripts/dump-and-restore.sh.
 * Requires .env with DATABASE_URL and DB_ENCRYPTION_KEY (local).
 *
 * If DINEROS_<ENV>_DB_ENCRYPTION_KEY is set (ENV = staging|production from
 * RESTORE_FROM_ENV or first arg): re-encrypts User, AccountRegister,
 * RegisterEntry, Reoccurrence via generated prisma/reencrypt migrate(), then
 * resets User emails/passwords for local login (fun dev emails).
 *
 * Otherwise (fallback): nulls Plaid columns, then overwrites User, AccountRegister,
 * RegisterEntry, and Reoccurrence with fun common placeholder names.
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import { migrate } from "../prisma/reencrypt";
import HashService from "../server/services/HashService";

dotenv.config();

const localKey = process.env.DB_ENCRYPTION_KEY;
if (!localKey) {
  console.error("DB_ENCRYPTION_KEY is required. Set it in .env.");
  process.exit(1);
}

const restoreFromEnv =
  process.env.RESTORE_FROM_ENV ||
  (process.argv[2] as string | undefined);
const sourceKey =
  restoreFromEnv &&
  (restoreFromEnv === "staging" || restoreFromEnv === "production")
    ? (process.env[
        `DINEROS_${restoreFromEnv.toUpperCase()}_DB_ENCRYPTION_KEY`
      ] as string | undefined)
    : undefined;

const useReencryptPath = Boolean(sourceKey);

const decryptionKeys = useReencryptPath
  ? [sourceKey!, localKey]
  : [localKey];

const prisma = new PrismaClient().$extends(
  fieldEncryptionExtension({
    encryptionKey: localKey,
    decryptionKeys,
  })
);

// Fun common names for fallback overwrite (and post–re-encrypt user reset)
const USER_EMAILS = [
  "dev@local.dev",
  "alice@local.dev",
  "bob@local.dev",
  "charlie@local.dev",
  "dana@local.dev",
];
const REGISTER_NAMES = [
  "Main Checking",
  "Savings",
  "Credit Card",
  "Cash",
  "Venmo",
  "PayPal",
  "Investment",
  "Loan",
  "Mortgage",
  "Side Hustle",
];
const ENTRY_DESCRIPTIONS = [
  "Groceries",
  "Coffee",
  "Gas",
  "Netflix",
  "Rent",
  "Salary",
  "Transfer",
  "Refund",
  "Dining out",
  "Utilities",
  "Amazon",
  "Spotify",
];
const RECURRENCE_DESCRIPTIONS = [
  "Monthly rent",
  "Weekly groceries",
  "Netflix",
  "Gym",
  "Phone bill",
  "Insurance",
  "Subscription",
  "Payday",
  "Savings transfer",
  "Loan payment",
];

function userEmail(index: number): string {
  return index < USER_EMAILS.length
    ? USER_EMAILS[index]
    : `dev-${index + 1}@local.dev`;
}

function registerName(index: number, id: number): string {
  return index < REGISTER_NAMES.length
    ? REGISTER_NAMES[index]
    : `Register ${id}`;
}

function entryDescription(index: number): string {
  return index < ENTRY_DESCRIPTIONS.length
    ? ENTRY_DESCRIPTIONS[index]
    : `Entry ${index + 1}`;
}

function recurrenceDescription(index: number, id: number): string {
  return index < RECURRENCE_DESCRIPTIONS.length
    ? RECURRENCE_DESCRIPTIONS[index]
    : `Recurrence ${id}`;
}

async function resetUserEmailsAndPasswords(): Promise<void> {
  const ids = await prisma.$queryRaw<{ id: bigint }[]>`SELECT id FROM user`;
  if (ids.length === 0) return;

  const password = process.env.RESTORE_DEV_PASSWORD ?? "dev";
  const hashedPassword = await new HashService().hash(password);

  const sortedIds = [...ids].map((r) => Number(r.id)).sort((a, b) => a - b);
  for (let i = 0; i < sortedIds.length; i++) {
    await prisma.user.update({
      where: { id: sortedIds[i] },
      data: { email: userEmail(i), password: hashedPassword },
    });
  }
  console.log(
    `Reset email/password for ${sortedIds.length} user(s). Login with dev@local.dev / ${password} (or alice@local.dev, bob@local.dev, etc.).`
  );
}

async function clearPlaidColumns(): Promise<void> {
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
}

async function fallbackOverwrite(): Promise<void> {
  await clearPlaidColumns();

  const userIds = await prisma.$queryRaw<{ id: bigint }[]>`SELECT id FROM user`;
  if (userIds.length > 0) {
    const password = process.env.RESTORE_DEV_PASSWORD ?? "dev";
    const hashedPassword = await new HashService().hash(password);
    const sorted = [...userIds].map((r) => Number(r.id)).sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      await prisma.user.update({
        where: { id: sorted[i] },
        data: { email: userEmail(i), password: hashedPassword },
      });
    }
    console.log(
      `Reset ${sorted.length} user(s) to fun dev emails (dev@local.dev, alice@local.dev, ...).`
    );
  }

  const registers = await prisma.accountRegister.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (let i = 0; i < registers.length; i++) {
    await prisma.accountRegister.update({
      where: { id: registers[i].id },
      data: { name: registerName(i, registers[i].id) },
    });
  }
  if (registers.length > 0) {
    console.log(`Reset ${registers.length} account register(s) to fun names.`);
  }

  try {
    const entries = await prisma.registerEntry.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (let i = 0; i < entries.length; i++) {
      await prisma.registerEntry.update({
        where: { id: entries[i].id },
        data: { description: entryDescription(i) },
      });
    }
    if (entries.length > 0) {
      console.log(`Reset ${entries.length} register entry(ies) to fun descriptions.`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unknown column") || msg.includes("doesn't exist")) {
      console.log("Skipped register_entry (column or table missing).");
    } else {
      throw e;
    }
  }

  try {
    const reoccurrences = await prisma.reoccurrence.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (let i = 0; i < reoccurrences.length; i++) {
      await prisma.reoccurrence.update({
        where: { id: reoccurrences[i].id },
        data: { description: recurrenceDescription(i, reoccurrences[i].id) },
      });
    }
    if (reoccurrences.length > 0) {
      console.log(`Reset ${reoccurrences.length} reoccurrence(s) to fun descriptions.`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unknown column") || msg.includes("doesn't exist")) {
      console.log("Skipped reoccurrence (column or table missing).");
    } else {
      throw e;
    }
  }

  console.log("Re-link Plaid in local if needed.");
}

async function main() {
  const userIds = await prisma.$queryRaw<{ id: bigint }[]>`SELECT id FROM user`;
  if (userIds.length === 0) {
    console.log("No users to reset.");
    return;
  }

  if (useReencryptPath) {
    console.log(
      `Re-encrypting with source key (${restoreFromEnv}); then resetting user emails for local login.`
    );
    await migrate(prisma as PrismaClient, (p) =>
      console.info(
        `${p.model.padEnd(15)} ${Math.round((100 * p.processed) / p.totalCount)}% ${p.processed}/${p.totalCount}`
      )
    );
    await resetUserEmailsAndPasswords();
  } else {
    console.log(
      "Source encryption key not set (DINEROS_STAGING_DB_ENCRYPTION_KEY or DINEROS_PRODUCTION_DB_ENCRYPTION_KEY). Using fallback overwrite with fun placeholder names."
    );
    await fallbackOverwrite();
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
