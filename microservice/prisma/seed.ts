import prismaPkg from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { accounts } from "./backup/accounts";
import { accountRegisters } from "./backup/accountRegisters";
import { users } from "./backup/users";
import { userSocials } from "./backup/userSocials";
import { intervals } from "./backup/intervals";
import { accountTypes } from "./backup/accountTypes";
import { userAccounts } from "./backup/userAccounts";
import { budgets } from "./backup/budgets";
import { categories } from "./backup/categories";
import { reoccurrences } from "./backup/reoccurrences";
import { reoccurrenceSkips } from "./backup/reoccurrenceSkips";
import { registerEntry } from "./backup/registerEntry";
import HashService from "../server/services/HashService";

import { fieldEncryptionExtension } from "prisma-field-encryption";
import { normalizePrismaDmmfForFieldEncryption } from "../../lib/normalizePrismaDmmf";
import dotenv from "dotenv";
import { log } from "../../logger";
dotenv.config();

const { PrismaClient, Prisma } = prismaPkg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Prisma initialization.");
}

const adapter = new PrismaMariaDb(databaseUrl);

export const prisma = new PrismaClient({ adapter }).$extends(
  fieldEncryptionExtension({
    dmmf: normalizePrismaDmmfForFieldEncryption(Prisma.dmmf),
    encryptionKey: process.env.DB_ENCRYPTION_KEY,
    decryptionKeys: process.env.DB_DECRYPTION_KEYS?.split(",") || [],
  }),
);

async function main() {
  log({ message: "start", level: "debug" });
  await prisma.account.createMany({
    data: accounts,
  });

  await prisma.user.createMany({
    data: users,
  });

  await prisma.userAccount.createMany({
    data: userAccounts,
  });

  await prisma.userSocial.createMany({
    data: userSocials,
  });

  await prisma.accountType.createMany({
    data: accountTypes,
  });

  await prisma.interval.createMany({
    data: intervals,
  });

  await prisma.budget.createMany({
    data: budgets,
  });

  await prisma.accountRegister.createMany({
    data: accountRegisters,
  });

  await prisma.reoccurrence.createMany({
    data: reoccurrences,
  });

  await prisma.reoccurrenceSkip.createMany({
    data: reoccurrenceSkips,
  });

  await prisma.registerEntry.createMany({
    data: registerEntry,
  });

  await prisma.category.createMany({
    data: categories,
  });

  // await prisma.registerEntry.updateMany({
  //   data: {
  //     plaidId: null,
  //     plaidIdHash: null,
  //   },
  // });

  // await prisma.accountRegister.updateMany({
  //   data: {
  //     plaidId: null,
  //     plaidIdHash: null,
  //     plaidAccessToken: null,
  //     plaidAccessTokenHash: null,
  //     plaidLastSyncAt: null,
  //   },
  // });

  const hashService = new HashService();

  await prisma.user.updateMany({
    data: {
      password: await hashService.hash("Carter$1Noah$1"),
      config: {},
      settings: {},
    },
  });
}

main()
  .catch((e) => {
    log({ message: "HERE", level: "debug" });
    log({ message: "Seed error", data: e, level: "error" });
    process.exit(1);
  })
  .finally(async () => {
    log({ message: "Finally", level: "debug" });
    await prisma.$disconnect();
  });
