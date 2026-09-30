import type { ExtraDebtPaymentLeg } from "./types";
import type {
  CacheRegisterEntry,
  ModernCacheService,
} from "./ModernCacheService";
import { IS_CREDIT_TYPE_IDS } from "~/consts";
import { roundToCents } from "~/lib/bankers-rounding";
import { forecastLogger } from "./logger";
import { dateTimeService } from "./DateTimeService";

type DisplayChain = {
  /** Value the synthetic balance row anchors the ledger at. */
  anchor: number;
  /** Post-anchor rows (manual + projected, non-cleared) in display order. */
  entries: CacheRegisterEntry[];
};

/**
 * Post-pass floor enforcement for extra debt payments.
 *
 * Payment sizing runs on days 1–3, before the month's bills, loan payments and
 * interest exist in the ledger, and its balance measurements can drift from the
 * ledger the register displays. Rather than trusting those measurements, this
 * pass runs after the whole timeline is materialized and before balances are
 * recomputed for persist: it walks each paying register's display chain and
 * trims (or drops) extra-debt-payment legs so the running balance never dips
 * below the register's minAccountBalance. Scheduled (contractual) payments are
 * never touched — the floor only governs the discretionary extra sweep.
 */
export class MinBalanceGuardService {
  private static readonly MONEY_EPSILON = 0.005; // half-cent tolerance

  private readonly cache: ModernCacheService;

  constructor(cache: ModernCacheService) {
    this.cache = cache;
  }

  enforceFloors(params: {
    accountRegisterIds: number[];
    extraDebtPaymentLegs: ExtraDebtPaymentLeg[];
  }): void {
    const { accountRegisterIds, extraDebtPaymentLegs } = params;
    if (extraDebtPaymentLegs.length === 0) {
      return;
    }

    const legsBySource = new Map<number, ExtraDebtPaymentLeg[]>();
    for (const leg of extraDebtPaymentLegs) {
      const list = legsBySource.get(leg.sourceAccountRegisterId) ?? [];
      list.push(leg);
      legsBySource.set(leg.sourceAccountRegisterId, list);
    }

    for (const accountRegisterId of accountRegisterIds) {
      const legs = legsBySource.get(accountRegisterId);
      if (!legs || legs.length === 0) continue;

      const account = this.cache.accountRegister.findOne({
        id: accountRegisterId,
      });
      if (!account || account.isArchived) continue;

      const floor = Number(account.minAccountBalance ?? 0);
      if (!(floor > 0)) continue;

      this.enforceFloorForAccount(account.id, account.name, floor, legs);
    }
  }

  private enforceFloorForAccount(
    accountRegisterId: number,
    accountName: string,
    floor: number,
    legs: ExtraDebtPaymentLeg[],
  ): void {
    const chain = this.buildDisplayChain(accountRegisterId);
    if (chain.entries.length === 0) return;

    const rawBalanceAfter: number[] = [];
    let running = chain.anchor;
    for (const entry of chain.entries) {
      running = roundToCents(running + entry.amount);
      rawBalanceAfter.push(running);
    }

    const indexByEntryId = new Map<string, number>();
    chain.entries.forEach((entry, index) => {
      indexByEntryId.set(entry.id, index);
    });

    const indexedLegs = legs
      .map((leg) => ({
        leg,
        index: indexByEntryId.get(leg.sourceEntryId),
      }))
      .filter(
        (item): item is { leg: ExtraDebtPaymentLeg; index: number } =>
          item.index !== undefined,
      )
      .sort((a, b) => a.index - b.index);

    if (indexedLegs.length === 0) return;

    // Latest payment first. Trimming a payment only raises balances after it,
    // so each payment can be sized against its own segment minimum without
    // crediting other trims — later segments were already sized to the floor
    // and only move further above it.
    for (let p = indexedLegs.length - 1; p >= 0; p--) {
      const { leg, index } = indexedLegs[p]!;
      const segmentEnd =
        p + 1 < indexedLegs.length ? indexedLegs[p + 1]!.index : chain.entries.length;

      let segmentMin = Number.POSITIVE_INFINITY;
      for (let i = index; i < segmentEnd; i++) {
        segmentMin = Math.min(segmentMin, rawBalanceAfter[i]!);
      }
      if (!Number.isFinite(segmentMin)) continue;

      const sourceEntry = this.cache.registerEntry.findById(leg.sourceEntryId);
      const debtEntry = this.cache.registerEntry.findById(leg.debtEntryId);
      if (!sourceEntry || !debtEntry) continue;

      // Source legs are debits (negative amounts). The segment minimum has
      // this payment's own debit already baked in, so the largest payment
      // magnitude that keeps every later balance at/above the floor is
      // (segment minimum excluding this debit) − floor.
      const paymentMagnitude = -+sourceEntry.amount;
      const maxAllowedAmount = roundToCents(
        segmentMin + paymentMagnitude - floor,
      );
      if (
        maxAllowedAmount + MinBalanceGuardService.MONEY_EPSILON >=
        paymentMagnitude
      ) {
        continue;
      }

      const trimmedAmount = Math.max(0, maxAllowedAmount);
      if (trimmedAmount <= MinBalanceGuardService.MONEY_EPSILON) {
        this.cache.registerEntry.remove({ id: leg.sourceEntryId });
        this.cache.registerEntry.remove({ id: leg.debtEntryId });
        forecastLogger.service(
          "MinBalanceGuard",
          `Removed extra debt payment that would breach min balance for ${accountName}`,
          {
            accountRegisterId,
            minAccountBalance: floor,
            segmentMinBalance: segmentMin,
            removedAmount: paymentMagnitude,
          },
        );
        continue;
      }

      sourceEntry.amount = -trimmedAmount;
      debtEntry.amount = trimmedAmount;
      forecastLogger.service(
        "MinBalanceGuard",
        `Trimmed extra debt payment to preserve min balance for ${accountName}`,
        {
          accountRegisterId,
          minAccountBalance: floor,
          segmentMinBalance: segmentMin,
          originalAmount: paymentMagnitude,
          trimmedAmount,
        },
      );
    }
  }

  /**
   * The post-anchor chain the register displays (same membership and same-day
   * ordering as recalculateRunningBalanceAndSort in app/lib/sort.ts): the
   * balance entry anchors, then manual + projected, non-cleared rows.
   */
  private buildDisplayChain(accountRegisterId: number): DisplayChain {
    const account = this.cache.accountRegister.findOne({
      id: accountRegisterId,
    });
    const entries = this.cache.registerEntry.find({
      accountRegisterId,
    });

    let anchor: number | null = null;
    let anchorEpoch = -Infinity;
    const chain: CacheRegisterEntry[] = [];

    for (const entry of entries) {
      if (entry.isBalanceEntry) {
        const epoch = dateTimeService.toDate(entry.createdAt as any).getTime();
        if (Number.isFinite(epoch) && epoch >= anchorEpoch) {
          anchor = +entry.amount;
          anchorEpoch = epoch;
        }
        continue;
      }
      if (entry.isCleared) continue;
      if (!entry.isManualEntry && !entry.isProjected) continue;
      chain.push(entry);
    }

    const isCredit = account
      ? IS_CREDIT_TYPE_IDS.includes(account.typeId)
      : false;
    chain.sort((a, b) => {
      const aEpoch = dateTimeService.toDate(a.createdAt as any).getTime();
      const bEpoch = dateTimeService.toDate(b.createdAt as any).getTime();
      if (aEpoch !== bEpoch) return aEpoch - bEpoch;
      return isCredit ? +a.amount - +b.amount : +b.amount - +a.amount;
    });

    return { anchor: anchor ?? +(account?.latestBalance ?? 0), entries: chain };
  }
}
