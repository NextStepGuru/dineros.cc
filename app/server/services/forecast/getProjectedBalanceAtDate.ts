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

/**
 * Balance at a date over the post-anchor chain the register actually renders
 * (see recalculateRunningBalanceAndSort in app/lib/sort.ts): the synthetic
 * balance entry anchors the ledger, then manual + projected, non-cleared rows
 * accumulate after it. Real non-manual uncleared rows (pending/posted Plaid
 * activity) are placed before the anchor and excluded here, so the bank
 * snapshot is never counted twice.
 */
export function getDisplayChainBalanceAtDate(
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

  let anchor: number | null = null;
  let anchorEpoch = -Infinity;
  let delta = 0;
  for (const entry of entries) {
    const entryEpoch = dateTimeService.toDate(entry.createdAt as any).getTime();
    if (!Number.isFinite(entryEpoch) || entryEpoch > targetEpoch) {
      continue;
    }
    if (entry.isBalanceEntry) {
      if (entryEpoch >= anchorEpoch) {
        anchor = +entry.amount;
        anchorEpoch = entryEpoch;
      }
      continue;
    }
    if (entry.isCleared) continue;
    if (entry.isManualEntry || entry.isProjected) {
      delta += +entry.amount;
    }
  }
  return (anchor ?? +account.latestBalance) + delta;
}
