import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "~/server/clients/prismaClient";
import { buildCategoryPaths } from "~/server/lib/categoryPaths";
import {
  defaultApplyModeForMerchant,
  merchantEntityIdFromPlaid,
  merchantNameFromPlaid,
  normalizeMerchantKey,
} from "~/server/lib/merchantCategoryKey";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function upsertMerchantCategoryRuleFromUserEdit(params: {
  accountId: string;
  categoryId: string | null;
  plaidJson: unknown;
  db?: PrismaClient;
}): Promise<void> {
  const { accountId, categoryId, plaidJson } = params;
  if (!categoryId) return;
  const db = params.db ?? defaultPrisma;
  const record = asRecord(plaidJson);
  const merchantName = merchantNameFromPlaid(record);
  const merchantKey = merchantName ? normalizeMerchantKey(merchantName) : "";
  if (!merchantKey) return;

  const categories = await db.category.findMany({
    where: { accountId, isArchived: false },
  });
  const paths = buildCategoryPaths(categories);
  const categoryPath = paths.get(categoryId) ?? "";
  const applyMode = defaultApplyModeForMerchant(merchantKey, categoryPath);
  const merchantEntityId = merchantEntityIdFromPlaid(record);

  await db.merchantCategoryRule.upsert({
    where: {
      accountId_merchantKey: { accountId, merchantKey },
    },
    create: {
      accountId,
      merchantKey,
      merchantEntityId,
      categoryId,
      applyMode,
    },
    update: {
      categoryId,
      applyMode,
      merchantEntityId: merchantEntityId ?? undefined,
    },
  });
}
