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
import prismaPkg from "@prisma/client";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import { migrate } from "../prisma/reencrypt";
import HashService from "../server/services/HashService";

const { PrismaClient } = prismaPkg;

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

// Fun common names for fallback overwrite (and post–re-encrypt user reset). Cycle by index so all get a fun name.
const USER_EMAILS = [
  "dev@local.dev",
  "alice@local.dev",
  "bob@local.dev",
  "charlie@local.dev",
  "dana@local.dev",
  "eve@local.dev",
  "frank@local.dev",
  "grace@local.dev",
  "henry@local.dev",
  "iris@local.dev",
  "jack@local.dev",
  "kate@local.dev",
  "leo@local.dev",
  "maya@local.dev",
  "nate@local.dev",
  "olivia@local.dev",
  "paul@local.dev",
  "quinn@local.dev",
  "ryan@local.dev",
  "sam@local.dev",
  "taylor@local.dev",
  "uma@local.dev",
  "vic@local.dev",
  "wren@local.dev",
  "xavier@local.dev",
  "yuki@local.dev",
  "zara@local.dev",
  "alex@local.dev",
  "jordan@local.dev",
  "casey@local.dev",
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
  "Emergency Fund",
  "Travel Fund",
  "Kids College",
  "House Down Payment",
  "HSA",
  "IRA",
  "401k",
  "Brokerage",
  "Crypto",
  "Rewards Card",
  "Business Checking",
  "Freelance",
  "Rental Property",
  "Pet Fund",
  "Car Fund",
  "Gift Fund",
  "Donations",
  "Subscriptions",
  "Fun Money",
  "Buffer",
  "Tax Escrow",
  "Insurance Sinking",
  "Home Repair",
  "Car Maintenance",
  "Medical",
  "Education",
  "Wedding",
  "Vacation",
  "Holiday",
  "Backup Card",
  "Joint Checking",
  "Trust",
  "Custodial",
  "Money Market",
  "CD Ladder",
  "T-Bills",
  "High-Yield Savings",
  "Local Credit Union",
  "Offshore",
  "Grandma's Cookie Jar",
  "Pocket Change",
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
  "Target",
  "Walmart",
  "Costco",
  "Whole Foods",
  "Trader Joe's",
  "Pharmacy",
  "Doctor",
  "Dentist",
  "Gym",
  "Yoga",
  "Streaming",
  "Internet",
  "Phone",
  "Insurance",
  "Car payment",
  "Parking",
  "Tolls",
  "Uber",
  "Lyft",
  "Flight",
  "Hotel",
  "Airbnb",
  "Concert",
  "Movie",
  "Books",
  "Gaming",
  "Software",
  "Subscriptions",
  "Haircut",
  "Dry cleaning",
  "Laundry",
  "Cleaning",
  "Plumber",
  "Electrician",
  "Garden",
  "Pet food",
  "Vet",
  "Kids activities",
  "School supplies",
  "Tuition",
  "Donation",
  "Gift",
  "Birthday",
  "Anniversary",
  "Wedding",
  "Baby shower",
  "Tips",
  "Cash withdrawal",
  "ATM",
  "Venmo in",
  "Venmo out",
  "Zelle",
  "PayPal",
  "Stripe payout",
  "Freelance",
  "Side gig",
  "Dividend",
  "Interest",
  "Rebate",
  "Reimbursement",
  "Bonus",
  "Tax refund",
  "Rental income",
  "Dividend reinvest",
  "Buy crypto",
  "Sell crypto",
  "Split bill",
  "Reimbursement",
  "Misc",
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
  "Mortgage",
  "Car payment",
  "Utilities",
  "Internet",
  "Streaming bundle",
  "Spotify",
  "Disney+",
  "HBO",
  "Apple One",
  "iCloud",
  "Adobe",
  "Microsoft 365",
  "Dropbox",
  "Rent",
  "HOA",
  "Property tax",
  "Car insurance",
  "Health insurance",
  "Dental",
  "Vision",
  "Life insurance",
  "Umbrella",
  "Pet insurance",
  "Phone",
  "Electric",
  "Gas",
  "Water",
  "Trash",
  "Sewer",
  "Alarm",
  "Lawn care",
  "Cleaning",
  "Childcare",
  "Tuition",
  "Student loan",
  "Credit card",
  "401k contribution",
  "IRA contribution",
  "Brokerage buy",
  "Savings",
  "Emergency fund",
  "Vacation fund",
  "Car fund",
  "Gift fund",
  "Donation",
  "Allowance",
  "Pocket money",
  "Coffee run",
  "Lunch",
  "Date night",
  "Weekly review",
  "Biweekly pay",
  "Monthly sweep",
  "Quarterly tax",
  "Annual premium",
  "Birthday fund",
  "Holiday fund",
  "Back to school",
  "Black Friday",
  "Cyber Monday",
];

function userEmail(index: number): string {
  return USER_EMAILS[index % USER_EMAILS.length];
}

function registerName(index: number, _id: number): string {
  return REGISTER_NAMES[index % REGISTER_NAMES.length];
}

function entryDescription(index: number): string {
  return ENTRY_DESCRIPTIONS[index % ENTRY_DESCRIPTIONS.length];
}

function recurrenceDescription(index: number, _id: number): string {
  return RECURRENCE_DESCRIPTIONS[index % RECURRENCE_DESCRIPTIONS.length];
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
    await migrate(prisma as PrismaClientType, (p) =>
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
