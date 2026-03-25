import type { ModernCacheService } from "./ModernCacheService";
import { dateTimeService } from "./DateTimeService";

/**
 * Shared projected balance at a date: latestBalance + sum of non-balance entries with createdAt <= target date.
 * Uses epoch comparison to avoid heavy date allocations in hot paths.
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
    const entryEpoch = dateTimeService.toDate(entry.createdAt as any).getTime();
    if (
      !entry.isBalanceEntry &&
      Number.isFinite(entryEpoch) &&
      entryEpoch <= targetEpoch
    ) {
      balance += +entry.amount;
    }
  }
  return balance;
}
