import type { CacheAccountRegister, ModernCacheService  } from "./ModernCacheService";
import type { IRegisterEntryService } from "./types";
import { dateTimeService } from "./DateTimeService";
import { getProjectedBalanceAtDate } from "./getProjectedBalanceAtDate";
import {
  DEPRECIATING_ASSET_TYPE_IDS,
  APPRECIATING_ASSET_TYPE_IDS,
} from "../../../consts";
import { roundToCents } from "../../../lib/bankers-rounding";

export class AssetDepreciationService {
  private cache: ModernCacheService;
  private entryService: IRegisterEntryService;

  constructor(
    cache: ModernCacheService,
    entryService: IRegisterEntryService
  ) {
    this.cache = cache;
    this.entryService = entryService;
  }

  getDepreciatingAssets(): CacheAccountRegister[] {
    return this.cache.accountRegister.find(
      (account) =>
        DEPRECIATING_ASSET_TYPE_IDS.includes(account.typeId) &&
        account.depreciationRate != null &&
        Number(account.depreciationRate) > 0
    );
  }

  getAppreciatingAssets(): CacheAccountRegister[] {
    return this.cache.accountRegister.find(
      (account) =>
        APPRECIATING_ASSET_TYPE_IDS.includes(account.typeId) &&
        account.depreciationRate != null &&
        Number(account.depreciationRate) > 0
    );
  }

  async processAssetValueChanges(
    accounts: CacheAccountRegister[],
    forecastDate?: Date
  ): Promise<void> {
    for (const account of accounts) {
      if (this.shouldProcessAssetValueChange(account, forecastDate)) {
        await this.processAccountAssetValueChange(account, forecastDate);
      }
    }
  }

  private shouldProcessAssetValueChange(
    account: CacheAccountRegister,
    forecastDate?: Date
  ): boolean {
    if (!account.depreciationRate || Number(account.depreciationRate) <= 0) {
      return false;
    }

    // Check if asset start date has been reached
    if (account.assetStartAt) {
      const startDate = dateTimeService.set(
        {
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        },
        dateTimeService.createUTC(account.assetStartAt)
      );
      const comparisonDate = forecastDate
        ? dateTimeService.set(
            {
              hour: 0,
              minute: 0,
              second: 0,
              milliseconds: 0,
            },
            dateTimeService.createUTC(forecastDate)
          )
        : dateTimeService.set({
            hour: 0,
            minute: 0,
            second: 0,
            milliseconds: 0,
          });

      if (dateTimeService.isBefore(comparisonDate, startDate)) {
        return false;
      }
    }

    // Process on statement date (same pattern as interest charges)
    const statementAt = dateTimeService.set(
      {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      },
      dateTimeService.createUTC(account.statementAt)
    );

    const comparisonDate = forecastDate
      ? dateTimeService.set(
          {
            hour: 0,
            minute: 0,
            second: 0,
            milliseconds: 0,
          },
          dateTimeService.createUTC(forecastDate)
        )
      : dateTimeService.set({
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        });

    return dateTimeService.isSameOrAfter(comparisonDate, statementAt);
  }

  private async processAccountAssetValueChange(
    accountRegister: CacheAccountRegister,
    forecastDate?: Date
  ): Promise<void> {
    const accrualDate = dateTimeService.toDate(
      dateTimeService.set(
        { hour: 0, minute: 0, second: 0, milliseconds: 0 },
        dateTimeService.createUTC(accountRegister.statementAt)
      )
    );

    const projectedBalance = getProjectedBalanceAtDate(
      this.cache,
      accountRegister.id,
      accrualDate
    );

    const isDepreciating = DEPRECIATING_ASSET_TYPE_IDS.includes(
      accountRegister.typeId
    );
    const isAppreciating = APPRECIATING_ASSET_TYPE_IDS.includes(
      accountRegister.typeId
    );

    if (!isDepreciating && !isAppreciating) {
      return;
    }

    const depreciationRate = Number(accountRegister.depreciationRate || 0);
    if (depreciationRate <= 0) {
      return;
    }

    const method =
      accountRegister.depreciationMethod || (isDepreciating ? "declining-balance" : "compound");
    const valueChange = this.calculateValueChange(
      accountRegister,
      projectedBalance,
      depreciationRate,
      method,
      isDepreciating
    );

    if (Math.abs(valueChange) < 0.01) {
      // Skip if change is less than a penny
      await this.advanceStatementDate(accountRegister, forecastDate);
      return;
    }

    const description = isDepreciating
      ? "Depreciation Adjustment"
      : "Appreciation Adjustment";
    const typeId = isDepreciating ? 2 : 3; // Use same type IDs as interest (2 = charge, 3 = earned)

    // Create entry with signed amount
    // Depreciation: negative amount (reduces balance)
    // Appreciation: positive amount (increases balance)
    this.entryService.createEntry({
      accountRegisterId: accountRegister.id,
      description: description,
      amount: valueChange,
      forecastDate: accrualDate,
      typeId: typeId,
    });

    // Advance statement date to next period
    await this.advanceStatementDate(accountRegister, forecastDate);
  }

  private calculateValueChange(
    accountRegister: CacheAccountRegister,
    currentValue: number,
    annualRate: number,
    method: string,
    isDepreciating: boolean
  ): number {
    const residualValue = accountRegister.assetResidualValue
      ? Number(accountRegister.assetResidualValue)
      : 0;

    switch (method) {
      case "straight-line": {
        if (!accountRegister.assetOriginalValue || !accountRegister.assetUsefulLifeYears) {
          // Fallback to declining-balance if required fields missing
          return this.calculateDecliningBalance(
            currentValue,
            annualRate,
            isDepreciating,
            residualValue
          );
        }

        const originalValue = Number(accountRegister.assetOriginalValue);
        const usefulLifeYears = Number(accountRegister.assetUsefulLifeYears);
        const totalDepreciation = originalValue - residualValue;
        const monthlyDepreciation = totalDepreciation / (usefulLifeYears * 12);

        if (isDepreciating) {
          // Stop if we've reached residual value
          if (currentValue <= residualValue) {
            return 0;
          }
          // Don't depreciate below residual value
          const newValue = Math.max(residualValue, currentValue - monthlyDepreciation);
          return roundToCents(newValue - currentValue);
        } else {
          // Appreciation doesn't use straight-line, fallback to compound
          return this.calculateCompound(
            currentValue,
            annualRate,
            isDepreciating
          );
        }
      }

      case "declining-balance": {
        return this.calculateDecliningBalance(
          currentValue,
          annualRate,
          isDepreciating,
          residualValue
        );
      }

      case "compound":
      default: {
        return this.calculateCompound(currentValue, annualRate, isDepreciating);
      }
    }
  }

  private calculateDecliningBalance(
    currentValue: number,
    annualRate: number,
    isDepreciating: boolean,
    residualValue: number
  ): number {
    if (isDepreciating) {
      // Monthly depreciation: current_value * annual_rate / 12
      const monthlyDepreciation = (currentValue * annualRate) / 12;
      const newValue = Math.max(residualValue, currentValue - monthlyDepreciation);
      return roundToCents(newValue - currentValue);
    } else {
      // Appreciation doesn't use declining-balance, use compound
      return this.calculateCompound(currentValue, annualRate, isDepreciating);
    }
  }

  private calculateCompound(
    currentValue: number,
    annualRate: number,
    isDepreciating: boolean
  ): number {
    // Monthly compound: current_value * annual_rate / 12
    const monthlyChange = (currentValue * annualRate) / 12;
    if (isDepreciating) {
      return roundToCents(-monthlyChange);
    } else {
      return roundToCents(monthlyChange);
    }
  }

  private async advanceStatementDate(
    accountRegister: CacheAccountRegister,
    _forecastDate?: Date
  ): Promise<void> {
    const statementAt = dateTimeService.createUTC(accountRegister.statementAt);
    const newStatementAt = this.calculateNextStatementDate(
      statementAt,
      accountRegister.statementIntervalId
    );
    accountRegister.statementAt = dateTimeService.toDate(newStatementAt);
    this.cache.accountRegister.update(accountRegister);
  }

  private calculateNextStatementDate(
    currentStatementAt: any,
    statementIntervalId: number
  ): any {
    switch (statementIntervalId) {
      case 1: {
        // Day
        const dailyMoment = dateTimeService.create(currentStatementAt);
        return dailyMoment.add(1, "day");
      }
      case 2: {
        // Week
        const weeklyMoment = dateTimeService.create(currentStatementAt);
        return weeklyMoment.add(1, "week");
      }
      case 3: {
        // Month - use same logic as AccountRegisterService
        const currentMoment = dateTimeService.createUTC(currentStatementAt);
        const currentDay = currentMoment.date() as number;
        const currentMonth = currentMoment.month() as number;
        const currentYear = currentMoment.year() as number;

        let nextMonth = currentMonth + 1;
        let nextYear = currentYear;
        if (nextMonth > 11) {
          nextMonth = 0;
          nextYear++;
        }

        const nextMonthMoment = dateTimeService.createUTC(
          new Date(Date.UTC(nextYear, nextMonth, 1)),
        );

        const daysInNextMonth = dateTimeService.daysInMonth(nextMonthMoment);

        let targetDay: number;
        let targetMonth = nextMonth;
        let targetYear = nextYear;

        if (currentDay > daysInNextMonth) {
          // Day doesn't exist in next month
          if (currentDay === 31 && nextMonth === 1) {
            // Jan 31 -> Mar 1 (not Feb 29)
            targetMonth = 2; // March
            targetDay = 1;
            if (targetMonth > 11) {
              targetMonth = 0;
              targetYear++;
            }
          } else {
            // Otherwise, clamp to last day of next month
            targetDay = daysInNextMonth;
          }
        } else {
          targetDay = currentDay;
        }

        return dateTimeService.createUTC(
          new Date(Date.UTC(targetYear, targetMonth, targetDay)),
        );
      }
      case 4: {
        // Year
        const yearlyMoment = dateTimeService.create(currentStatementAt);
        return yearlyMoment.add(1, "year");
      }
      default: {
        // Default to monthly
        const defaultMoment = dateTimeService.create(currentStatementAt);
        return defaultMoment.add(1, "month");
      }
    }
  }
}
