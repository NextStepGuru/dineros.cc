import type { PrismaClient, Reoccurrence } from "@prisma/client";
import type { IReoccurrenceService } from "./types";
import type { CacheReoccurrence } from "./ModernCacheService";
import { ModernCacheService } from "./ModernCacheService";
import { RegisterEntryService } from "./RegisterEntryService";
import { TransferService } from "./TransferService";
import { forecastLogger } from "./logger";
import { dateTimeService } from "./DateTimeService";
import { holidayService } from "./HolidayService";
import {
  calculateNextOccurrenceDate,
  isTwiceMonthlyInterval,
} from "./reoccurrenceIntervals";

export class ReoccurrenceService implements IReoccurrenceService {
  /** Pre-scheduled reoccurrences by ISO date string (YYYY-MM-DD). Built once at timeline start; O(1) lookup per day. */
  private _scheduleByDate: Map<string, CacheReoccurrence[]> = new Map();
  private cache: ModernCacheService;
  private entryService: RegisterEntryService;
  private transferService: TransferService;

  constructor(
    _db: PrismaClient,
    cache: ModernCacheService,
    entryService: RegisterEntryService,
    transferService: TransferService,
  ) {
    this.cache = cache;
    this.entryService = entryService;
    this.transferService = transferService;
  }

  async processReoccurrences(
    reoccurrences: Reoccurrence[],
    endDate: Date,
  ): Promise<void> {
    forecastLogger.service(
      "ReoccurrenceService",
      `Processing ${
        reoccurrences.length
      } reoccurrences up to ${dateTimeService.format("YYYY-MM-DD", endDate)}`,
    );
    for (const reoccurrence of reoccurrences) {
      await this.processReoccurrence(reoccurrence, endDate);
    }
  }

  private async processReoccurrence(
    reoccurrence: Reoccurrence,
    endDate: Date,
  ): Promise<void> {
    if (!reoccurrence.lastAt) {
      return;
    }
    const firstNextDate = this.calculateNextOccurrence(reoccurrence);
    if (!firstNextDate) {
      return;
    }
    let nextAt: any = dateTimeService.createUTC(firstNextDate);
    let occurrenceCount = 0;

    forecastLogger.serviceDebug(
      "ReoccurrenceService",
      `Processing reoccurrence ${reoccurrence.id} (${
        reoccurrence.description
      }) from ${dateTimeService.format(
        "YYYY-MM-DD",
        nextAt,
      )} to ${dateTimeService.format("YYYY-MM-DD", endDate)}`,
    );

    // Process all due occurrences up to endDate
    while (
      nextAt &&
      dateTimeService.isSameOrBefore(nextAt, dateTimeService.createUTC(endDate))
    ) {
      // Apply weekend adjustment to the current occurrence date if enabled
      let adjustedLastAt = dateTimeService.clone(nextAt);
      if (reoccurrence.adjustBeforeIfOnWeekend) {
        adjustedLastAt = this.adjustDateIfWeekendOrHoliday(adjustedLastAt);
      }

      // endAt boundary is evaluated against the effective (possibly adjusted) occurrence date
      if (
        reoccurrence.endAt &&
        dateTimeService.isAfter(adjustedLastAt, reoccurrence.endAt)
      ) {
        break;
      }

      occurrenceCount++;

      // Create a reoccurrence object with the adjusted date for entry creation
      const reoccurrenceForEntry = {
        ...reoccurrence,
        lastAt: dateTimeService.toDate(adjustedLastAt),
      };

      // For debt accounts, cap payment to current balance so payments never exceed balance
      let effectiveAmount = Number(reoccurrence.amount);
      let skipBecauseDebtPaidOff = false;
      const targetAccountForCap = this.cache.accountRegister?.findOne?.({
        id: reoccurrence.accountRegisterId,
      });
      if (
        targetAccountForCap &&
        [3, 4, 5, 99].includes(targetAccountForCap.typeId)
      ) {
        const amountOwed = Math.abs(+targetAccountForCap.balance);
        if (amountOwed <= 0.005) {
          effectiveAmount = 0;
          skipBecauseDebtPaidOff = true; // Skip: debt already paid off
        } else if (effectiveAmount > amountOwed) {
          effectiveAmount = amountOwed;
        }
      }
      if (skipBecauseDebtPaidOff) {
        // Advance to next occurrence without creating an entry
        const processedNominalDate = dateTimeService.toDate(nextAt);
        const nextDate = this.calculateNextOccurrence({
          ...reoccurrence,
          lastAt: processedNominalDate,
        });
        if (!nextDate) break;
        nextAt = dateTimeService.createUTC(nextDate);
        const nowDate = dateTimeService.nowDate();
        const cachedReoccurrence = this.cache.reoccurrence.findOne({
          id: reoccurrence.id,
        });
        if (cachedReoccurrence) {
          cachedReoccurrence.lastAt = processedNominalDate;
          if (
            dateTimeService.isSameOrBefore(
              adjustedLastAt,
              dateTimeService.createUTC(nowDate),
            )
          ) {
            cachedReoccurrence.lastRunAt =
              dateTimeService.toDate(adjustedLastAt);
          }
          this.cache.reoccurrence.update(cachedReoccurrence);
        }
        if (occurrenceCount > 1000) break;
        continue;
      }

      // Create the entry for this occurrence
      const occurrenceDescription = this.getOccurrenceDescription(
        reoccurrence.description,
        reoccurrence.intervalId,
        (reoccurrence as { intervalName?: string }).intervalName,
        dateTimeService.toDate(nextAt),
      );
      if (reoccurrence.transferAccountRegisterId) {
        this.transferService.transferBetweenAccounts({
          targetAccountRegisterId: reoccurrence.transferAccountRegisterId,
          sourceAccountRegisterId: reoccurrence.accountRegisterId,
          amount: effectiveAmount,
          description: occurrenceDescription,
          reoccurrence: reoccurrenceForEntry,
        });
      } else {
        this.entryService.createEntry({
          accountRegisterId: reoccurrence.accountRegisterId,
          description: occurrenceDescription,
          amount: effectiveAmount,
          reoccurrence: reoccurrenceForEntry,
          typeId: 9, // Reoccurrence Entry
        });
      }

      // Advance to next occurrence
      const processedNominalDate = dateTimeService.toDate(nextAt);
      const nextDate = this.calculateNextOccurrence({
        ...reoccurrence,
        lastAt: processedNominalDate,
      });
      if (!nextDate) break;
      nextAt = dateTimeService.createUTC(nextDate);

      // Update the reoccurrence in cache so timeline advances (forecasting can go into future)
      const nowDate = dateTimeService.nowDate();
      const cachedReoccurrence = this.cache.reoccurrence.findOne({
        id: reoccurrence.id,
      });
      if (cachedReoccurrence) {
        cachedReoccurrence.lastAt = processedNominalDate;
        if (
          dateTimeService.isSameOrBefore(
            adjustedLastAt,
            dateTimeService.createUTC(nowDate),
          )
        ) {
          cachedReoccurrence.lastRunAt = dateTimeService.toDate(adjustedLastAt);
        }
        this.cache.reoccurrence.update(cachedReoccurrence);
      }

      // Safety check to prevent infinite loops
      if (occurrenceCount > 1000) {
        forecastLogger.error(
          "ReoccurrenceService",
          `Too many occurrences for reoccurrence ${reoccurrence.id}, stopping`,
        );
        break;
      }
    }

    forecastLogger.serviceDebug(
      "ReoccurrenceService",
      `Processed ${occurrenceCount} occurrences for reoccurrence ${reoccurrence.id}`,
    );
  }

  calculateNextOccurrence(reoccurrence: any): Date | null {
    if (!reoccurrence?.lastAt) return null;
    if (reoccurrence.intervalCount <= 0) return null;
    const cached = reoccurrence as { intervalName?: string };
    const intervalName = cached.intervalName?.trim().toLowerCase() ?? "";

    const computed = calculateNextOccurrenceDate({
      lastAt: dateTimeService.toDate(reoccurrence.lastAt),
      intervalId: reoccurrence.intervalId,
      intervalCount: reoccurrence.intervalCount,
      intervalName: cached.intervalName,
    });
    if (computed) {
      return computed;
    }

    if (
      reoccurrence.intervalId === 5 ||
      intervalName === "once" ||
      intervalName === "one-time" ||
      intervalName === "one time"
    ) {
      return null;
    }

    if (intervalName) {
      // Fallback to intervalId when intervalName is unsupported.
      return this.calculateNextOccurrence({
        ...reoccurrence,
        intervalName: undefined,
      } as Reoccurrence);
    }

    throw new Error(`Invalid intervalId: ${reoccurrence.intervalId}`);
  }

  private adjustDateIfWeekendOrHoliday(date: any): any {
    let adjusted = dateTimeService.clone(date);
    while (true) {
      const dayOfWeek = adjusted.day(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidayService.isHoliday(dateTimeService.toDate(adjusted));
      if (!isWeekend && !isHoliday) {
        return adjusted;
      }
      adjusted = dateTimeService.subtract(1, "days", adjusted);
    }
  }

  private getOccurrenceDescription(
    baseDescription: string,
    intervalId: number,
    intervalName: string | undefined,
    nominalDate: Date,
  ): string {
    if (!isTwiceMonthlyInterval(intervalId, intervalName)) {
      return baseDescription;
    }
    const dayOfMonth = dateTimeService.date(nominalDate);
    const suffix = dayOfMonth === 15 ? "#1" : "#2";
    return `${baseDescription} ${suffix}`;
  }

  /**
   * Build schedule once before the timeline loop. Maps each date string to reoccurrences whose first due date is that day.
   */
  initReoccurrenceSchedule(startDate: Date, endDate: Date): void {
    this._scheduleByDate = new Map();
    const endMoment = dateTimeService.createUTC(endDate);
    const reoccurrences = this.cache.reoccurrence.find({});
    for (const reoccurrence of reoccurrences) {
      const nextDate = this.calculateNextOccurrence(reoccurrence);
      if (
        nextDate == null ||
        !dateTimeService.isValid(nextDate) ||
        dateTimeService.isAfter(dateTimeService.createUTC(nextDate), endMoment)
      ) {
        continue;
      }
      const dateStr = dateTimeService.format("YYYY-MM-DD", nextDate);
      const list = this._scheduleByDate.get(dateStr) ?? [];
      list.push(reoccurrence);
      this._scheduleByDate.set(dateStr, list);
    }
  }

  getReoccurrencesDue(maxDate: Date): CacheReoccurrence[] {
    const dueMoment = dateTimeService.createUTC(maxDate);
    return (
      this.cache.reoccurrence.find((reoccurrence) => {
        const nextDate = this.calculateNextOccurrence(reoccurrence);
        return (
          nextDate != null &&
          dateTimeService.isValid(nextDate) &&
          dateTimeService.isSameOrBefore(
            dateTimeService.createUTC(nextDate),
            dueMoment,
          )
        );
      }) || []
    );
  }

  isReoccurrenceActive(reoccurrence: Reoccurrence, currentDate: Date): boolean {
    const current = dateTimeService.createUTC(currentDate);
    if (!reoccurrence.lastAt) return false;
    const lastAt = dateTimeService.createUTC(reoccurrence.lastAt);

    // Check if reoccurrence has ended
    if (
      reoccurrence.endAt &&
      dateTimeService.isAfter(current, reoccurrence.endAt)
    ) {
      return false;
    }

    // Check if reoccurrence has started
    return dateTimeService.isSameOrAfter(current, lastAt);
  }

  filterActiveReoccurrences(
    reoccurrences: Reoccurrence[],
    currentDate: Date,
  ): Reoccurrence[] {
    return reoccurrences.filter((reoccurrence) =>
      this.isReoccurrenceActive(reoccurrence, currentDate),
    );
  }

  getIntervalDescription(intervalId: number): string {
    switch (intervalId) {
      case 1:
        return "daily";
      case 2:
        return "weekly";
      case 3:
        return "monthly";
      case 4:
        return "yearly";
      case 5:
        return "once";
      case 6:
        return "twice-monthly";
      default:
        return "unknown";
    }
  }
}
