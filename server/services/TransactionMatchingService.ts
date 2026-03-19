import type {
  AccountRegister,
  AccountType,
  PrismaClient,
  RegisterEntry,
} from "@prisma/client";
import type { Transaction } from "plaid";
import { log } from "~/server/logger";
import { normalizePlaidDescription } from "~/server/lib/normalizePlaidDescription";
import { dateTimeService } from "./forecast/DateTimeService";

export interface TransactionMatchResult {
  isMatched: boolean;
  existingEntry?: RegisterEntry;
  matchType?: "exact" | "fuzzy" | "reoccurrence" | "none" | "skip";
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
    accountRegisterId: number,
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
    formattedAmount: number,
  ): Promise<RegisterEntry | null> {
    const dt = dateTimeService.parseInput(transaction.date);
    const dayStart = dateTimeService.startOfDay(dt).toDate();
    const dayEnd = dateTimeService
      .startOfDay(dateTimeService.add(1, "day", dt))
      .toDate();

    return await this.db.registerEntry.findFirst({
      where: {
        accountRegisterId,
        amount: formattedAmount,
        createdAt: {
          gte: dayStart,
          lt: dayEnd,
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
    dayRange: number = DEFAULT_FUZZY_DAY_RANGE,
  ): Promise<RegisterEntry | null> {
    const dt = dateTimeService.parseInput(transaction.date);
    const daysBefore = dateTimeService.subtract(dayRange, "day", dt).toDate();
    const daysAfter = dateTimeService.add(dayRange, "day", dt).toDate();

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
   * Forecast / recurrence register line without Plaid yet, same amount and date window.
   */
  private async findReoccurrenceRegisterEntryMatch(
    transaction: Transaction,
    accountRegisterId: number,
    reoccurrenceId: number,
    formattedAmount: number,
    dayRange: number,
  ): Promise<RegisterEntry | null> {
    const dt = dateTimeService.parseInput(transaction.date);
    const daysBefore = dateTimeService.subtract(dayRange, "day", dt).toDate();
    const daysAfter = dateTimeService.add(dayRange, "day", dt).toDate();
    const txDate = dateTimeService.toDate(dt);

    const candidates = await this.db.registerEntry.findMany({
      where: {
        accountRegisterId,
        reoccurrenceId,
        amount: formattedAmount,
        plaidId: null,
        isBalanceEntry: false,
        createdAt: {
          gte: daysBefore,
          lte: daysAfter,
        },
      },
    });

    if (candidates.length === 0) {
      return null;
    }

    const txMs = txDate.getTime();
    candidates.sort((a, b) => {
      const da = Math.abs(a.createdAt.getTime() - txMs);
      const db = Math.abs(b.createdAt.getTime() - txMs);
      if (da !== db) {
        return da - db;
      }
      if (a.isProjected !== b.isProjected) {
        return a.isProjected ? -1 : 1;
      }
      return 0;
    });

    return candidates[0] ?? null;
  }

  /**
   * Matches a transaction against existing entries
   */
  async matchTransaction(
    transaction: Transaction,
    accountRegister: AccountRegister,
    accountType: AccountType,
    options: MatchOptions = {},
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
      accountRegister.id,
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

    const normalizedName = normalizePlaidDescription(transaction.name ?? "");
    if (normalizedName) {
      const alias = await this.db.reoccurrencePlaidNameAlias.findUnique({
        where: {
          accountRegisterId_normalizedName: {
            accountRegisterId: accountRegister.id,
            normalizedName,
          },
        },
      });

      if (alias) {
        const recurrenceMatch = await this.findReoccurrenceRegisterEntryMatch(
          transaction,
          accountRegister.id,
          alias.reoccurrenceId,
          formattedAmount,
          fuzzyDayRange,
        );

        if (recurrenceMatch) {
          log({
            message: `Reoccurrence alias match for transaction: ${transaction.name}`,
            data: {
              transactionId: transaction.transaction_id,
              existingEntryId: recurrenceMatch.id,
              reoccurrenceId: alias.reoccurrenceId,
              accountRegisterId: accountRegister.id,
            },
            level: "debug",
          });

          return {
            isMatched: true,
            existingEntry: recurrenceMatch,
            matchType: "reoccurrence",
          };
        }
      }
    }

    // Then try exact match
    const exactMatch = await this.findExactTransactionMatch(
      transaction,
      accountRegister.id,
      formattedAmount,
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
        fuzzyDayRange,
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
    matchType: "exact" | "fuzzy" | "reoccurrence",
  ): Promise<RegisterEntry> {
    const updateData: any = {
      plaidId: transaction.transaction_id,
      plaidJson: JSON.parse(JSON.stringify(transaction)),
      // Preserve existing description, don't overwrite with Plaid description
    };

    if (matchType === "fuzzy" || matchType === "reoccurrence") {
      updateData.createdAt = dateTimeService.toDate(
        dateTimeService.parseInput(transaction.date),
      );
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
    transactionData: any,
  ): Promise<RegisterEntry> {
    return await this.db.registerEntry.create({
      data: transactionData,
    });
  }

  /**
   * Remove register entries by Plaid transaction IDs (for Transactions Sync "removed").
   */
  async removePlaidTransactions(
    accountRegisterId: number,
    plaidTransactionIds: string[],
  ): Promise<number> {
    if (plaidTransactionIds.length === 0) return 0;
    const result = await this.db.registerEntry.deleteMany({
      where: {
        accountRegisterId,
        plaidId: { in: plaidTransactionIds },
      },
    });
    return result.count;
  }
}

export default TransactionMatchingService;
