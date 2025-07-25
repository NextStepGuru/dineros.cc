import type {
  AccountRegister,
  AccountType,
  PrismaClient,
  RegisterEntry,
} from "@prisma/client";
import type { Transaction } from "plaid";
import { log } from "~/server/logger";

export interface TransactionMatchResult {
  isMatched: boolean;
  existingEntry?: RegisterEntry;
  matchType?: "exact" | "fuzzy" | "none" | "skip";
}

export interface MatchOptions {
  enableFuzzyMatching?: boolean;
  fuzzyDayRange?: number;
}

const DEFAULT_FUZZY_DAY_RANGE = 5;

class TransactionMatchingService {
  db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
  }

  /**
   * Checks if a transaction with the same plaidId already exists
   */
  private async findExistingPlaidTransaction(
    transaction: Transaction,
    accountRegisterId: number
  ): Promise<RegisterEntry | null> {
    return await this.db.registerEntry.findFirst({
      where: {
        accountRegisterId,
        plaidId: transaction.transaction_id,
      },
    });
  }

  /**
   * Finds existing transactions by exact match (date and amount)
   */
  private async findExactTransactionMatch(
    transaction: Transaction,
    accountRegisterId: number,
    formattedAmount: number
  ): Promise<RegisterEntry | null> {
    const transactionDate = new Date(transaction.date);

    return await this.db.registerEntry.findFirst({
      where: {
        accountRegisterId,
        amount: formattedAmount,
        createdAt: {
          gte: new Date(
            transactionDate.getFullYear(),
            transactionDate.getMonth(),
            transactionDate.getDate()
          ),
          lt: new Date(
            transactionDate.getFullYear(),
            transactionDate.getMonth(),
            transactionDate.getDate() + 1
          ),
        },
        plaidId: null, // Only match manual entries
      },
    });
  }

  /**
   * Finds existing transactions by fuzzy match (±N days, same amount)
   */
  private async findFuzzyTransactionMatch(
    transaction: Transaction,
    accountRegisterId: number,
    formattedAmount: number,
    dayRange: number = DEFAULT_FUZZY_DAY_RANGE
  ): Promise<RegisterEntry | null> {
    const transactionDate = new Date(transaction.date);
    const daysBefore = new Date(transactionDate);
    daysBefore.setDate(daysBefore.getDate() - dayRange);
    const daysAfter = new Date(transactionDate);
    daysAfter.setDate(daysAfter.getDate() + dayRange);

    const result = await this.db.registerEntry.findFirst({
      where: {
        accountRegisterId,
        amount: formattedAmount,
        createdAt: {
          gte: daysBefore,
          lte: daysAfter,
        },
        plaidId: null, // Only match manual entries
      },
    });

    return result;
  }

  /**
   * Matches a transaction against existing entries
   */
  async matchTransaction(
    transaction: Transaction,
    accountRegister: AccountRegister,
    accountType: AccountType,
    options: MatchOptions = {}
  ): Promise<TransactionMatchResult> {
    const {
      enableFuzzyMatching = true,
      fuzzyDayRange = DEFAULT_FUZZY_DAY_RANGE,
    } = options;

    const formattedAmount = accountType.isCredit
      ? transaction.amount
      : transaction.amount * -1;

    // First check if this Plaid transaction already exists
    const existingPlaidTransaction = await this.findExistingPlaidTransaction(
      transaction,
      accountRegister.id
    );

    if (existingPlaidTransaction) {
      log({
        message: `Plaid transaction already exists: ${transaction.name}`,
        data: {
          transactionId: transaction.transaction_id,
          existingEntryId: existingPlaidTransaction.id,
          accountRegisterId: accountRegister.id,
        },
        level: "debug",
      });

      return {
        isMatched: false,
        matchType: "skip",
      };
    }

    // Then try exact match
    const exactMatch = await this.findExactTransactionMatch(
      transaction,
      accountRegister.id,
      formattedAmount
    );

    if (exactMatch) {
      log({
        message: `Exact match found for transaction: ${transaction.name}`,
        data: {
          transactionId: transaction.transaction_id,
          existingEntryId: exactMatch.id,
          accountRegisterId: accountRegister.id,
        },
        level: "debug",
      });

      return {
        isMatched: true,
        existingEntry: exactMatch,
        matchType: "exact",
      };
    }

    // Then try fuzzy match if enabled
    if (enableFuzzyMatching) {
      const fuzzyMatch = await this.findFuzzyTransactionMatch(
        transaction,
        accountRegister.id,
        formattedAmount,
        fuzzyDayRange
      );

      if (fuzzyMatch) {
        log({
          message: `Fuzzy match found for transaction: ${transaction.name}`,
          data: {
            transactionId: transaction.transaction_id,
            existingEntryId: fuzzyMatch.id,
            accountRegisterId: accountRegister.id,
            dayRange: fuzzyDayRange,
          },
          level: "debug",
        });

        return {
          isMatched: true,
          existingEntry: fuzzyMatch,
          matchType: "fuzzy",
        };
      }
    }

    return {
      isMatched: false,
      matchType: "none",
    };
  }

  /**
   * Updates an existing transaction with Plaid data
   */
  async updateExistingTransaction(
    existingEntry: RegisterEntry,
    transaction: Transaction,
    matchType: "exact" | "fuzzy"
  ): Promise<RegisterEntry> {
    const updateData: any = {
      plaidId: transaction.transaction_id,
      plaidJson: JSON.parse(JSON.stringify(transaction)),
      // Preserve existing description, don't overwrite with Plaid description
    };

    // Update date if it was a fuzzy match
    if (matchType === "fuzzy") {
      updateData.createdAt = new Date(transaction.date);
    }

    return await this.db.registerEntry.update({
      where: { id: existingEntry.id },
      data: updateData,
    });
  }

  /**
   * Creates a new transaction entry
   */
  async createNewTransaction(
    transaction: Transaction,
    accountRegister: AccountRegister,
    accountType: AccountType,
    transactionData: any
  ): Promise<RegisterEntry> {
    return await this.db.registerEntry.create({
      data: transactionData,
    });
  }
}

export default TransactionMatchingService;
