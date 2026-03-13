import type { Moment } from "moment";
import type { ModernCacheService } from "./ModernCacheService";
import { dateTimeService } from "./DateTimeService";

/**
 * Shared projected balance at a date: latestBalance + sum of non-balance entries with createdAt <= target date.
 * Uses epoch comparison to avoid Moment allocations in hot paths.
 */
export function getProjectedBalanceAtDate(
  cache: ModernCacheService,
  accountId: number,
  targetDate: Date
): number {
  const account = cache.accountRegister.findOne({ id: accountId });
  if (!account) return 0;

  const targetEpoch = dateTimeService.endOfDay(targetDate).valueOf();
  const entries = cache.registerEntry.find({
    accountRegisterId: accountId,
  });
  let balance = +account.latestBalance;
  for (const entry of entries) {
    if (
      !entry.isBalanceEntry &&
      (entry.createdAt as Moment).valueOf() <= targetEpoch
    ) {
      balance += +entry.amount;
    }
  }
  return balance;
}
