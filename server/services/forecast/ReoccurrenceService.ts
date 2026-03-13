import type { PrismaClient, Reoccurrence } from "@prisma/client";
import type { IReoccurrenceService, CreateEntryParams } from "./types";
import type {
  CacheAccountRegister,
  CacheReoccurrence,
} from "./ModernCacheService";
import { Decimal } from "@prisma/client/runtime/library";
import { ModernCacheService } from "./ModernCacheService";
import { RegisterEntryService } from "./RegisterEntryService";
import { TransferService } from "./TransferService";
import { forecastLogger } from "./logger";
import { dateTimeService } from "./DateTimeService";

export class ReoccurrenceService implements IReoccurrenceService {
  /** Pre-scheduled reoccurrences by ISO date string (YYYY-MM-DD). Built once at timeline start; O(1) lookup per day. */
  private _scheduleByDate: Map<string, CacheReoccurrence[]> = new Map();

  constructor(
    private db: PrismaClient,
    private cache: ModernCacheService,
    private entryService: RegisterEntryService,
    private transferService: TransferService,
  ) {}

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

    if (
      (reoccurrence.endAt &&
        dateTimeService.isAfter(nextAt, reoccurrence.endAt))
    ) {
      return;
    }

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
      // Only process if not past endAt
      if (
        reoccurrence.endAt &&
        dateTimeService.isAfter(nextAt, reoccurrence.endAt)
      ) {
        break;
      }

      occurrenceCount++;

      // Apply weekend adjustment to the current occurrence date if enabled
      let adjustedLastAt = dateTimeService.clone(nextAt);
      if (reoccurrence.adjustBeforeIfOnWeekend) {
        adjustedLastAt = this.adjustDateIfWeekend(adjustedLastAt);
      }

      // Create a reoccurrence object with the adjusted date for entry creation
      const reoccurrenceForEntry = {
        ...reoccurrence,
        lastAt: dateTimeService.toDate(adjustedLastAt),
      };

      // Create the entry for this occurrence
      if (reoccurrence.transferAccountRegisterId) {
        this.transferService.transferBetweenAccounts({
          targetAccountRegisterId: reoccurrence.accountRegisterId,
          sourceAccountRegisterId: reoccurrence.transferAccountRegisterId,
          amount: Number(reoccurrence.amount),
          description: reoccurrence.description,
          reoccurrence: reoccurrenceForEntry,
        });
      } else {
        this.entryService.createEntry({
          accountRegisterId: reoccurrence.accountRegisterId,
          description: reoccurrence.description,
          amount: +reoccurrence.amount,
          reoccurrence: reoccurrenceForEntry,
          typeId: 9, // Reoccurrence Entry
        });
      }

      // Advance to next occurrence
      const nextDate = this.calculateNextOccurrence({
        ...reoccurrence,
        lastAt: dateTimeService.toDate(nextAt),
      });
      if (!nextDate) break;
      nextAt = dateTimeService.createUTC(nextDate);

      // Update the reoccurrence in cache so timeline advances (forecasting can go into future)
      const nowDate = dateTimeService.nowDate();
      const cachedReoccurrence = this.cache.reoccurrence.findOne({
        id: reoccurrence.id,
      });
      if (cachedReoccurrence) {
        cachedReoccurrence.lastAt = dateTimeService.toDate(nextAt);
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

  calculateNextOccurrence(reoccurrence: Reoccurrence): Date | null {
    const lastAt = dateTimeService.createUTC(reoccurrence.lastAt);
    const cached = reoccurrence as CacheReoccurrence;
    const intervalName = cached.intervalName?.trim().toLowerCase();

    if (intervalName) {
      if (intervalName === "once") return null;
      const unit = intervalName as "days" | "weeks" | "months" | "years";
      return dateTimeService.toDate(
        dateTimeService.add(reoccurrence.intervalCount, unit, lastAt),
      );
    }

    switch (reoccurrence.intervalId) {
      case 1: // Daily
        return dateTimeService.toDate(
          dateTimeService.add(reoccurrence.intervalCount, "days", lastAt),
        );
      case 2: // Weekly
        return dateTimeService.toDate(
          dateTimeService.add(reoccurrence.intervalCount, "weeks", lastAt),
        );
      case 3: // Monthly
        return dateTimeService.toDate(
          dateTimeService.add(reoccurrence.intervalCount, "months", lastAt),
        );
      case 4: // Yearly
        return dateTimeService.toDate(
          dateTimeService.add(reoccurrence.intervalCount, "years", lastAt),
        );
      case 5: // Once (one-time)
        return null;
      default:
        throw new Error(`Invalid intervalId: ${reoccurrence.intervalId}`);
    }
  }

  private adjustDateIfWeekend(date: any): any {
    const dayOfWeek = date.day(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0) {
      // Sunday - move to Friday
      return dateTimeService.subtract(2, "days", date);
    } else if (dayOfWeek === 6) {
      // Saturday - move to Friday
      return dateTimeService.subtract(1, "days", date);
    }
    return date;
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
      default:
        return "unknown";
    }
  }
}
