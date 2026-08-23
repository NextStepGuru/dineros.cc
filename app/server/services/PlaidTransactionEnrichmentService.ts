import type { Category, PrismaClient } from "@prisma/client";
import type { Transaction } from "plaid";
import { prisma as defaultPrisma } from "~/server/clients/prismaClient";
import { buildCategoryPaths as buildCategoryPathsFromLib } from "~/server/lib/categoryPaths";
import { transactionDisplayLabel as transactionDisplayLabelFromLib } from "~/server/lib/plaidTransactionLabel";
import TransactionCategorizationService from "~/server/services/TransactionCategorizationService";

/** Prefer `merchant_name` / `original_description` over deprecated `name`. */
export function transactionDisplayLabel(tx: Transaction): string {
  return transactionDisplayLabelFromLib(tx);
}

export function buildCategoryPaths(categories: Category[]): Map<string, string> {
  return buildCategoryPathsFromLib(categories);
}

export type PlaidEnrichmentMetadata = {
  userId: number | null;
  accountRegisterId: number;
  accountId: string;
  plaidTransactionId: string;
};

class PlaidTransactionEnrichmentService {
  db: PrismaClient;
  private categorizer: TransactionCategorizationService;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
    this.categorizer = new TransactionCategorizationService(db);
  }

  async enrich(params: {
    transaction: Transaction;
    accountRegisterId: number;
    accountId: string;
    context: PlaidEnrichmentMetadata;
    updateDescription?: boolean;
  }): Promise<{
    description: string;
    categoryId: string | null;
    categorySource: string | null;
  }> {
    const result = await this.categorizer.classify({
      transaction: params.transaction,
      accountId: params.accountId,
      context: {
        userId: params.context.userId,
        accountRegisterId: params.context.accountRegisterId,
        accountId: params.context.accountId,
        plaidTransactionId: params.context.plaidTransactionId,
      },
      purpose: "plaid_transaction_enrichment",
      updateDescription: params.updateDescription,
    });
    return {
      description: result.description,
      categoryId: result.categoryId,
      categorySource: result.source,
    };
  }
}

export default PlaidTransactionEnrichmentService;
