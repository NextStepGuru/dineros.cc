# Migration Guide: LinearBudgetService to ForecastEngine

## Overview

This guide outlines the step-by-step process for migrating from the monolithic `LinearBudgetService` to the new modular `ForecastEngine` architecture.

## Phase 1: Preparation and Testing (Week 1-2)

### 1.1 Install New Architecture Alongside Existing

```typescript
// Keep existing LinearBudgetService intact
import LinearBudgetService from './LinearBudgetService';
import { ForecastEngineFactory } from './forecast';

class DualModeService {
  private oldService: LinearBudgetService;
  private newEngine: ForecastEngine;
  private useNewEngine: boolean;

  constructor(db: PrismaClient, useNewEngine = false) {
    this.oldService = new LinearBudgetService(db);
    this.newEngine = ForecastEngineFactory.create(db);
    this.useNewEngine = useNewEngine;
  }

  async recalculate({ accountId }: { accountId?: string }) {
    if (this.useNewEngine) {
      const context = {
        accountId,
        startDate: new Date(),
        endDate: moment().add(5, 'years').toDate(),
      };

      const result = await this.newEngine.recalculate(context);

      if (!result.isSuccess) {
        console.error('New engine failed, falling back to old service');
        return this.oldService.recalculate({ accountId });
      }

      return result.registerEntries;
    }

    return this.oldService.recalculate({ accountId });
  }
}
```

### 1.2 Add Feature Flags

```typescript
// Add environment variable or database flag
const USE_NEW_FORECAST_ENGINE = process.env.USE_NEW_FORECAST_ENGINE === 'true';

// Or use a more sophisticated feature flag system
const isNewEngineEnabled = await featureFlags.isEnabled('new-forecast-engine', userId);
```

### 1.3 Set Up Comprehensive Testing

```bash
# Run comprehensive forecast tests
npm run test:forecast:all
```

## Phase 2: Gradual Rollout (Week 3-4)

### 2.1 Internal Testing

```typescript
// Enable for internal testing accounts first
const useNewEngine = await shouldUseNewEngine(accountId);

if (useNewEngine) {
  // Use new ForecastEngine
  const result = await forecastEngine.recalculate(context);

  // Optionally, run old service in background for comparison
  if (ENABLE_COMPARISON_MODE) {
    const oldResult = await oldService.recalculate({ accountId });
    await logComparison(result.registerEntries, oldResult);
  }

  return result.registerEntries;
}
```

### 2.2 Comparison and Validation

```typescript
class ResultComparator {
  static async compare(
    newResults: RegisterEntry[],
    oldResults: RegisterEntry[]
  ): Promise<ComparisonReport> {
    return {
      entryCountMatch: newResults.length === oldResults.length,
      balanceAccuracy: this.compareBalances(newResults, oldResults),
      timingAccuracy: this.compareTiming(newResults, oldResults),
      differences: this.findDifferences(newResults, oldResults),
    };
  }

  static compareBalances(newResults: RegisterEntry[], oldResults: RegisterEntry[]) {
    // Compare final balances for each account
    // Flag any discrepancies > $0.01
  }
}
```

## Phase 3: Production Rollout (Week 5-6)

### 3.1 Staged Rollout

```typescript
// Rollout stages
const rolloutStages = {
  stage1: { percentage: 5, criteria: 'new_accounts' },
  stage2: { percentage: 20, criteria: 'small_datasets' },
  stage3: { percentage: 50, criteria: 'all_except_complex' },
  stage4: { percentage: 100, criteria: 'all' },
};

function shouldUseNewEngine(accountId: string, stage: string): boolean {
  const hash = hashCode(accountId);
  const percentage = rolloutStages[stage].percentage;
  return (hash % 100) < percentage;
}
```

### 3.2 Monitoring and Alerting

```typescript
// Add monitoring for the new system
class ForecastMonitoring {
  static async trackExecution(
    accountId: string,
    executionTime: number,
    success: boolean,
    entryCount: number
  ) {
    // Log metrics to your monitoring system
    await metrics.gauge('forecast.execution_time', executionTime, {
      account_id: accountId,
      success: success.toString(),
    });

    if (executionTime > 5000) {
      await alerts.send('Forecast calculation took too long', {
        accountId,
        executionTime,
        entryCount,
      });
    }
  }
}
```

## Phase 4: Legacy Cleanup (Week 7-8)

### 4.1 Remove Old Service

Once the new engine is proven stable:

```typescript
// Replace LinearBudgetService usage
// OLD:
const budgetService = new LinearBudgetService(db);
const results = await budgetService.recalculate({ accountId });

// NEW:
const forecastEngine = ForecastEngineFactory.create(db);
const context = {
  accountId,
  startDate: new Date(),
  endDate: moment().add(5, 'years').toDate(),
};
const result = await forecastEngine.recalculate(context);
const results = result.registerEntries;
```

### 4.2 Update API Endpoints

```typescript
// Update server/api/recalculate.post.ts
export default defineEventHandler(async (event) => {
  const { accountId } = await readBody(event);

  const forecastEngine = ForecastEngineFactory.create(prisma);
  const context = {
    accountId,
    startDate: moment().startOf('month').toDate(),
    endDate: moment().add(MAX_YEARS, 'years').toDate(),
  };

  const result = await forecastEngine.recalculate(context);

  if (!result.isSuccess) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Forecast calculation failed',
      data: result.errors,
    });
  }

  return result.registerEntries;
});
```

## Breaking Changes and Compatibility

### 4.3 API Changes

| Old Method | New Method | Notes |
|------------|------------|-------|
| `service.recalculate({ accountId })` | `engine.recalculate({ accountId, startDate, endDate })` | Now requires date range |
| `service.createEntry()` | `entryService.createEntry()` | Moved to RegisterEntryService |
| `service.transferBalance()` | `transferService.transferBetweenAccounts()` | Moved to TransferService |

### 4.4 Data Structure Changes

```typescript
// OLD: Returns array directly
const entries: RegisterEntry[] = await service.recalculate({ accountId });

// NEW: Returns structured result
const result: ForecastResult = await engine.recalculate(context);
const entries: RegisterEntry[] = result.registerEntries;
const accounts = result.accountRegisters;
const success = result.isSuccess;
const errors = result.errors;
```

## Testing Strategy During Migration

### 5.1 Automated Testing

```bash
# Run comparison tests daily
npm run test:daily-comparison

# Performance benchmarks
npm run test:performance

# Regression tests
npm run test:regression
```

### 5.2 Manual Testing Checklist

- [ ] Basic budget scenarios work correctly
- [ ] Loan calculations match previous results
- [ ] Transfer logic works as expected
- [ ] Reoccurrence scheduling is accurate
- [ ] Performance meets targets
- [ ] Error handling works properly
- [ ] Edge cases are handled

## Rollback Plan

### 5.3 Emergency Rollback

```typescript
// Immediate rollback capability
class EmergencyRollback {
  static async rollbackToOldService() {
    // Set feature flag
    await featureFlags.disable('new-forecast-engine');

    // Clear any new engine data if needed
    await this.cleanupNewEngineData();

    // Log rollback reason
    await logging.error('Emergency rollback to old forecast service', {
      timestamp: new Date(),
      reason: 'Production issues with new engine',
    });
  }
}
```

### 5.4 Gradual Rollback

```typescript
// Reduce rollout percentage if issues found
const rollbackStages = {
  reduce_to_50: { percentage: 50 },
  reduce_to_20: { percentage: 20 },
  reduce_to_5: { percentage: 5 },
  complete_rollback: { percentage: 0 },
};
```

## Performance Monitoring

### 5.5 Key Metrics to Track

- **Execution Time**: Should be ≤ 5 seconds for large datasets
- **Memory Usage**: LokiJS cache efficiency
- **Database Operations**: Number of queries and their performance
- **Error Rate**: Should be < 0.1%
- **Accuracy**: Results should match old service within $0.01

### 5.6 Success Criteria

✅ **Phase 1 Complete When:**
- All tests pass
- Performance benchmarks met
- No critical bugs found

✅ **Phase 2 Complete When:**
- 20% of users migrated successfully
- No production issues reported
- Performance is stable

✅ **Phase 3 Complete When:**
- 100% of users migrated
- Old service can be safely removed
- All monitoring looks healthy

## Support and Troubleshooting

### 5.7 Common Issues

**Issue**: New engine slower than old service
**Solution**: Check LokiJS cache size, optimize queries

**Issue**: Results don't match exactly
**Solution**: Review rounding logic and date calculations

**Issue**: Memory leaks
**Solution**: Ensure cache is properly cleared between runs

### 5.8 Emergency Contacts

- **Lead Developer**: [Contact Info]
- **DevOps Team**: [Contact Info]
- **Database Admin**: [Contact Info]

## Post-Migration Benefits

After successful migration, you'll have:

✅ **Maintainable Code**: Smaller, focused services
✅ **Better Testing**: Individual components can be tested
✅ **Improved Performance**: Optimized data operations
✅ **Easier Debugging**: Clear separation of concerns
✅ **Future Flexibility**: Easy to add new features
