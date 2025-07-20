import moment from "moment";
import type { PrismaClient, Reoccurrence } from "@prisma/client";
import type { IReoccurrenceService } from "./types";
import { ModernCacheService } from "./ModernCacheService";
import { RegisterEntryService } from "./RegisterEntryService";
import { TransferService } from "./TransferService";

export class ReoccurrenceService implements IReoccurrenceService {
  constructor(
    private db: PrismaClient,
    private cache: ModernCacheService,
    private entryService: RegisterEntryService,
    private transferService: TransferService
  ) {}

  async processReoccurrences(reoccurrences: Reoccurrence[], endDate: Date): Promise<void> {
    console.log(`[ReoccurrenceService] Processing ${reoccurrences.length} reoccurrences up to ${moment(endDate).format('YYYY-MM-DD')}`);
    for (const reoccurrence of reoccurrences) {
      await this.processReoccurrence(reoccurrence, endDate);
    }
  }

  private async processReoccurrence(reoccurrence: Reoccurrence, endDate: Date): Promise<void> {
    let lastAt: moment.Moment | null = moment(reoccurrence.lastAt).utc();
    const originalLastAt = lastAt ? lastAt.clone() : null;
    let occurrenceCount = 0;

    if (!lastAt || (reoccurrence.endAt && lastAt.isAfter(reoccurrence.endAt))) {
      return;
    }

    console.log(`[ReoccurrenceService] Processing reoccurrence ${reoccurrence.id} (${reoccurrence.description}) from ${lastAt.format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`);

    // Process all due occurrences up to endDate
    while (lastAt && lastAt.isSameOrBefore(moment(endDate).utc())) {
      // Only process if not past endAt
      if (reoccurrence.endAt && lastAt.isAfter(reoccurrence.endAt)) {
        break;
      }

      occurrenceCount++;

      // Apply weekend adjustment to the current occurrence date if enabled
      let adjustedLastAt = lastAt.clone();
      if (reoccurrence.adjustBeforeIfOnWeekend) {
        adjustedLastAt = this.adjustDateIfWeekend(adjustedLastAt);
      }

      // Create a reoccurrence object with the adjusted date for entry creation
      const reoccurrenceForEntry = {
        ...reoccurrence,
        lastAt: adjustedLastAt.toDate()
      };

      // Create the entry for this occurrence
      if (reoccurrence.transferAccountRegisterId) {
        this.transferService.transferBetweenAccounts({
          targetAccountRegisterId: reoccurrence.accountRegisterId,
          sourceAccountRegisterId: reoccurrence.transferAccountRegisterId,
          amount: reoccurrence.amount,
          description: reoccurrence.description,
          reoccurrence: reoccurrenceForEntry,
        });
      } else {
        this.entryService.createEntry({
          accountRegisterId: reoccurrence.accountRegisterId,
          description: reoccurrence.description,
          amount: +reoccurrence.amount,
          reoccurrence: reoccurrenceForEntry,
        });
      }

      // Advance to next occurrence
      const nextDate = this.calculateNextOccurrence({ ...reoccurrence, lastAt: lastAt.toDate() });
      if (!nextDate) break;
      lastAt = moment(nextDate).utc();

      // Update the reoccurrence in cache
      const cachedReoccurrence = this.cache.reoccurrence.findOne({ id: reoccurrence.id });
      if (cachedReoccurrence) {
        cachedReoccurrence.lastAt = lastAt.toDate();
        this.cache.reoccurrence.update(cachedReoccurrence);
      }
    }

    // After processing, update the original reoccurrence object's lastAt
    if (lastAt && originalLastAt && !lastAt.isSame(originalLastAt)) {
      reoccurrence.lastAt = lastAt.toDate();
    }

    console.log(`[ReoccurrenceService] Created ${occurrenceCount} occurrences for reoccurrence ${reoccurrence.id}`);
  }

  calculateNextOccurrence(reoccurrence: Reoccurrence): Date | null {
    const lastAt = moment(reoccurrence.lastAt).utc();

    switch (reoccurrence.intervalId) {
      case 1: // day
        return lastAt.clone().add({ day: reoccurrence.intervalCount }).toDate();

      case 2: // week
        return lastAt.clone().add({ week: reoccurrence.intervalCount }).toDate();

      case 3: // month
        return lastAt.clone().add({ month: reoccurrence.intervalCount }).toDate();

      case 4: // year
        return lastAt.clone().add({ year: reoccurrence.intervalCount }).toDate();

      case 5: // once
        return null;

      default:
        throw new Error(`Invalid intervalId: ${reoccurrence.intervalId}`);
    }
  }

  /**
   * Adjusts a date to the previous Friday if it falls on a weekend
   */
  private adjustDateIfWeekend(date: moment.Moment): moment.Moment {
    const dayOfWeek = date.day(); // 0 = Sunday, 6 = Saturday

    if (dayOfWeek === 0) { // Sunday
      return date.clone().subtract(2, 'days'); // Move to Friday
    } else if (dayOfWeek === 6) { // Saturday
      return date.clone().subtract(1, 'day'); // Move to Friday
    }

    return date.clone(); // Weekday, no adjustment needed - but still clone to avoid mutation
  }



  getReoccurrencesDue(maxDate: Date): Reoccurrence[] {
    const dueMoment = moment(maxDate).utc();

    return this.cache.reoccurrence.find((reoccurrence) =>
      !!reoccurrence.lastAt && moment(reoccurrence.lastAt).isSameOrBefore(dueMoment)
    );
  }

  isReoccurrenceActive(reoccurrence: Reoccurrence, currentDate: Date): boolean {
    const current = moment(currentDate).utc();
    const lastAt = moment(reoccurrence.lastAt).utc();

    // Check if it's time for this reoccurrence
    if (lastAt.isAfter(current)) {
      return false;
    }

    // Check if it hasn't ended
    if (reoccurrence.endAt && current.isAfter(reoccurrence.endAt)) {
      return false;
    }

    return true;
  }

  filterActiveReoccurrences(reoccurrences: Reoccurrence[], currentDate: Date): Reoccurrence[] {
    return reoccurrences.filter(reoccurrence =>
      this.isReoccurrenceActive(reoccurrence, currentDate)
    );
  }

  getIntervalDescription(intervalId: number): string {
    switch (intervalId) {
      case 1: return "daily";
      case 2: return "weekly";
      case 3: return "monthly";
      case 4: return "yearly";
      case 5: return "once";
      default: return "unknown";
    }
  }
}
