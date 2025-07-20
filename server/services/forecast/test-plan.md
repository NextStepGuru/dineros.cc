# Forecast Engine Test Plan

## Overview
This document outlines the testing strategy for the ModernCacheService-powered forecast system.

## 1. Unit Tests

### DataLoaderService
- **loadAccountData()**: Test loading various account configurations
- **loadAccountRegisters()**: Test account register loading with different filters
- **loadRegisterEntries()**: Test entry loading with different statuses
- **loadReoccurrences()**: Test reoccurrence loading and caching
- **getMinReoccurrenceDate()**: Test date calculation logic

### LoanCalculatorService
- **calculateInterestCharge()**: Test interest calculations for different account types
  - Standard credit/debit accounts (apr/12)
  - Loan accounts (using Loan library)
  - Different APR scenarios (apr1, apr2, apr3)
- **calculateMinPayment()**: Test minimum payment calculations
- **determineCurrentAPR()**: Test APR selection logic based on dates
- **shouldProcessInterest()**: Test filtering logic

### RegisterEntryService
- **createEntry()**: Test entry creation with various parameters
- **updateEntryStatuses()**: Test status updates (pending/projected)
- **calculateRunningBalances()**: Test balance calculations and sorting
- **filterSkippedEntries()**: Test reoccurrence skip filtering
- **createBalanceEntry()**: Test balance entry creation

### TransferService
- **transferBetweenAccounts()**: Test account-to-account transfers
- **processExtraDebtPayments()**: Test extra payment logic
- **shouldProcessExtraDebtPayment()**: Test payment eligibility
- **findDebtAccounts()**: Test debt account identification

### ReoccurrenceService
- **processReoccurrences()**: Test reoccurrence processing
- **calculateNextOccurrence()**: Test date calculations for all interval types
  - Daily (intervalId: 1)
  - Weekly (intervalId: 2)
  - Monthly (intervalId: 3)
  - Yearly (intervalId: 4)
  - Once (intervalId: 5)
- **isReoccurrenceActive()**: Test active status logic

### AccountRegisterService
- **processInterestCharges()**: Test interest charge processing
- **updateStatementDates()**: Test statement date updates
- **getAccountsByType()**: Test account filtering
- **isAccountActive()**: Test archive status checking

### DataPersisterService
- **persistForecastResults()**: Test database persistence
- **cleanupProjectedEntries()**: Test cleanup operations
- **updateEntryStatuses()**: Test status update operations
- **getResultsCount()**: Test result counting

## 2. Integration Tests

### ForecastEngine
- **recalculate()**: Test complete forecast workflow
  - Simple account with basic reoccurrences
  - Complex scenario with loans, transfers, and extra payments
  - Error handling and recovery scenarios
  - Large dataset performance

### End-to-End Scenarios
1. **Basic Budget Scenario**
   - Checking account with salary deposit
   - Credit card with minimum payments
   - Verify forecast accuracy

2. **Loan Payment Scenario**
   - Mortgage with monthly payments
   - Auto loan with extra payments
   - Interest calculations and payment scheduling

3. **Investment Account Scenario**
   - 401k contributions
   - HSA contributions
   - Asset value tracking

4. **Complex Transfer Scenario**
   - Multiple accounts with interdependencies
   - Extra debt payment automation
   - Transfer validation

## 3. Performance Tests

### Benchmarks
- **Data Loading Performance**: Time to load large datasets
- **Calculation Performance**: Forecast calculation speed
- **Memory Usage**: LokiJS cache efficiency
- **Database Operations**: Persistence performance

### Test Data Sizes
- Small: 1 account, 10 entries, 5 reoccurrences
- Medium: 10 accounts, 1,000 entries, 50 reoccurrences
- Large: 50 accounts, 10,000 entries, 200 reoccurrences

### Performance Targets
- Small dataset: < 100ms
- Medium dataset: < 1s
- Large dataset: < 5s

## 4. Regression Tests

### Production Validation
- **Data Accuracy**: Verify financial calculation correctness
- **Edge Cases**: Test boundary conditions
- **Error Scenarios**: Verify error handling
- **Performance**: Confirm 5-10x speed improvements

### Test Cases from Production
- Real customer data scenarios (anonymized)
- Historical bug fixes verification
- Performance regression detection

## 5. Mock Data Generation

### Test Data Factory
```typescript
class TestDataFactory {
  static createAccount(overrides?: Partial<AccountRegister>): AccountRegister
  static createReoccurrence(overrides?: Partial<Reoccurrence>): Reoccurrence
  static createRegisterEntry(overrides?: Partial<RegisterEntry>): RegisterEntry
  static createComplexScenario(): TestScenario
}
```

### Scenario Templates
- **Personal Budget**: Basic income/expense scenario
- **Business Account**: Complex multi-account scenario
- **Investment Portfolio**: Asset tracking scenario
- **Debt Management**: Loan and credit card scenario

## 6. Test Environment Setup

### Database Configuration
- Test database with sample data
- Migration testing
- Cleanup procedures

### Mock Services
- Prisma mock for unit tests
- Redis mock for caching tests
- External service mocks

## 7. Continuous Integration

### Test Pipeline
1. Unit tests (fast feedback)
2. Integration tests (moderate speed)
3. Performance tests (slower, run on PR)
4. Regression tests (full suite, nightly)

### Coverage Requirements
- Unit test coverage: > 90%
- Integration test coverage: > 80%
- Performance benchmarks: All critical paths

## 8. Documentation Tests

### API Documentation
- Service interface documentation
- Usage examples
- Error scenarios

### Migration Guide
- Step-by-step migration from old service
- Backward compatibility notes
- Breaking changes documentation
