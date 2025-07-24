#!/usr/bin/env tsx

import { performance } from "perf_hooks";
import { dateTimeService } from "../DateTimeService";
import { ForecastEngineFactory } from "../index";
import { log } from "../../logger";

// ANSI color codes for pretty output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// Mock database for testing
const createMockDatabase = () =>
  ({
    accountRegister: {
      findMany: async () => [
        {
          id: 1,
          budgetId: 1,
          accountId: "test-account",
          name: "Test Checking",
          balance: 2500,
          latestBalance: 2500,
          minPayment: null,
          statementAt: dateTimeService.add(1, "month").toDate(),
          apr1: null,
          apr1StartAt: null,
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          targetAccountRegisterId: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: 1,
          minAccountBalance: 500,
          allowExtraPayment: true,
          isArchived: false,
          typeId: 1,
          plaidId: null,
        },
        {
          id: 2,
          budgetId: 1,
          accountId: "test-account",
          name: "Test Credit Card",
          balance: -800,
          latestBalance: -800,
          minPayment: 25,
          statementAt: dateTimeService.add(15, "days").toDate(),
          apr1: 0.18,
          apr1StartAt: dateTimeService.subtract(1, "year").toDate(),
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          targetAccountRegisterId: 1,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: 1,
          minAccountBalance: null,
          allowExtraPayment: false,
          isArchived: false,
          typeId: 2,
          plaidId: null,
        },
      ],
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    registerEntry: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 }),
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
      count: async () => 0,
    },
    reoccurrence: {
      findMany: async () => [
        {
          id: 1,
          accountId: "test-account",
          accountRegisterId: 1,
          intervalId: 3,
          intervalCount: 1,
          transferAccountRegisterId: null,
          lastAt: dateTimeService.startOf("month").toDate(),
          endAt: null,
          amount: 4000,
          description: "Salary",
          totalIntervals: null,
          elapsedIntervals: null,
          updatedAt: new Date(),
          adjustBeforeIfOnWeekend: false,
        },
        {
          id: 2,
          accountId: "test-account",
          accountRegisterId: 1,
          intervalId: 3,
          intervalCount: 1,
          transferAccountRegisterId: null,
          lastAt: dateTimeService.startOf("month").add(5, "days").toDate(),
          endAt: null,
          amount: -1500,
          description: "Rent",
          totalIntervals: null,
          elapsedIntervals: null,
          updatedAt: new Date(),
          adjustBeforeIfOnWeekend: false,
        },
      ],
      aggregate: async () => ({
        _min: { lastAt: dateTimeService.startOf("month").toDate() },
      }),
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    reoccurrenceSkip: {
      findMany: async () => [],
    },
  } as any);

async function testBasicFunctionality() {
  log({ message: `${colors.cyan}${colors.bright}🧪 Testing Basic Functionality${colors.reset}\n`, level: "debug" });

  const mockDb = createMockDatabase();
  const engine = ForecastEngineFactory.create(mockDb);

  const context = {
    accountId: "test-account",
    startDate: moment().startOf("month").toDate(),
    endDate: moment().add(6, "months").toDate(),
  };

  try {
    const startTime = performance.now();
    const result = await engine.recalculate(context);
    const endTime = performance.now();

    const executionTime = endTime - startTime;

    if (result.isSuccess) {
      log({ message: `${colors.green}✅ Forecast calculation successful!${colors.reset}`, level: "debug" });
      log({ message: `${colors.blue}📊 Results:${colors.reset}`, level: "debug" });
      log({ message: `   • Execution time: ${executionTime.toFixed(2)}ms`, level: "debug" });
      log({ message: `   • Register entries: ${result.registerEntries.length}`, level: "debug" });
      log({ message: `   • Account registers: ${result.accountRegisters.length}`, level: "debug" });

      // Analyze results
      const balanceEntries = result.registerEntries.filter(
        (e) => e.isBalanceEntry
      );
      const projectedEntries = result.registerEntries.filter(
        (e) => e.isProjected
      );
      const pendingEntries = result.registerEntries.filter((e) => e.isPending);

      log({ message: `   • Balance entries: ${balanceEntries.length}`, level: "debug" });
      log({ message: `   • Projected entries: ${projectedEntries.length}`, level: "debug" });
      log({ message: `   • Pending entries: ${pendingEntries.length}`, level: "debug" });

      // Show sample entries
      log({ message: `\n${colors.blue}📝 Sample Entries:${colors.reset}`, level: "debug" });
      result.registerEntries.slice(0, 5).forEach((entry, i) => {
        const date = moment(entry.createdAt).format("YYYY-MM-DD");
        const amount =
          entry.amount >= 0
            ? `+$${entry.amount.toFixed(2)}`
            : `-$${Math.abs(entry.amount).toFixed(2)}`;
        log({ message: `   ${i + 1}. ${date} | ${
            entry.description
          } | ${amount} | Balance: $${entry.balance.toFixed(2)}`, level: "debug" });
      });
    } else {
      log({ message: `${colors.red}❌ Forecast calculation failed!${colors.reset}`, level: "debug" });
      if (result.errors) {
        result.errors.forEach((error) => {
          log({ message: `   ${colors.red}Error: ${error}${colors.reset}`, level: "debug" });
        });
      }
    }
  } catch (error) {
    log({ message: `${colors.red}❌ Test failed with error: ${error}${colors.reset}`, level: "error" });
  }

  log({ message: "\n", level: "debug" });
}

async function testCachePerformance() {
  log({ message: `${colors.magenta}${colors.bright}⚡ Testing Cache Performance${colors.reset}\n`, level: "debug" });

  const mockDb = createMockDatabase();
  const engine = ForecastEngineFactory.create(mockDb);
  const cache = engine.getCache();

  // Test cache insertion performance
  log({ message: `${colors.blue}Testing cache insertion performance...${colors.reset}`, level: "debug" });
  const insertStart = performance.now();

  for (let i = 1; i <= 1000; i++) {
    cache.accountRegister.insert({
      id: i,
      typeId: (i % 5) + 1,
      budgetId: 1,
      accountId: "perf-test",
      name: `Account ${i}`,
      balance: Math.random() * 10000,
      latestBalance: Math.random() * 10000,
      minPayment: 50,
      statementAt: moment(),
      apr1: 0.15,
      apr1StartAt: new Date(),
      apr2: null,
      apr2StartAt: null,
      apr3: null,
      apr3StartAt: null,
      targetAccountRegisterId: null,
      loanStartAt: new Date(),
      loanPaymentsPerYear: 12,
      loanTotalYears: 30,
      loanOriginalAmount: 100000,
      loanPaymentSortOrder: i,
      minAccountBalance: 500,
      allowExtraPayment: true,
      isArchived: false,
      plaidId: null,
    });
  }

  const insertTime = performance.now() - insertStart;
  log({ message: `${colors.green}✅ Inserted 1,000 accounts in ${insertTime.toFixed(2)}ms${
      colors.reset}`, level: "debug" });

  // Test query performance
  log({ message: `${colors.blue}Testing query performance...${colors.reset}`, level: "debug" });
  const queryStart = performance.now();

  for (let i = 0; i < 100; i++) {
    const randomType = Math.floor(Math.random() * 5) + 1;
    const results = cache.accountRegister.find({ typeId: randomType });
    // Do something with results to prevent optimization
    if (results.length === 0) log({ message: "No results", level: "debug" });
  }

  const queryTime = performance.now() - queryStart;
  log({ message: `${colors.green}✅ Completed 100 queries in ${queryTime.toFixed(2)}ms${
      colors.reset}`, level: "debug" });

  // Test chained operations
  log({ message: `${colors.blue}Testing chained operations...${colors.reset}`, level: "debug" });
  const chainStart = performance.now();

  const chainedResults = cache.accountRegister
    .chain()
    .find((account) => account.balance > 5000)
    .simplesort("balance", true)
    .limit(10)
    .data();

  const chainTime = performance.now() - chainStart;
  log({ message: `${colors.green}✅ Chained operation completed in ${chainTime.toFixed(
      2
    )}ms${colors.reset}`, level: "debug" });
  log({ message: `   Found ${chainedResults.length} accounts with balance > $5,000`, level: "debug" });

  // Show cache statistics
  const stats = cache.getStats();
  log({ message: `\n${colors.blue}📊 Cache Statistics:${colors.reset}`, level: "debug" });
  log({ message: `   • Account Registers: ${stats.accountRegisters}`, level: "debug" });
  log({ message: `   • Register Entries: ${stats.registerEntries}`, level: "debug" });
  log({ message: `   • Reoccurrences: ${stats.reoccurrences}`, level: "debug" });
  log({ message: `   • Reoccurrence Skips: ${stats.reoccurrenceSkips}`, level: "debug" });

  log({ message: "\n", level: "debug" });
}

async function runAllTests() {
  log({ message: `${colors.bright}${colors.green}🚀 Forecast Engine Test Suite${colors.reset}\n`, level: "debug" });
  log({ message: `${colors.yellow}Testing the new ModernCacheService-based forecast system...${colors.reset}\n`, level: "debug" });

  // Run basic functionality test
  await testBasicFunctionality();

  // Run cache performance test
  await testCachePerformance();

  log({ message: `${colors.bright}${colors.green}✨ All tests completed!${colors.reset}\n`, level: "debug" });

  // Show next steps
  log({ message: `${colors.blue}${colors.bright}🎯 Next Steps:${colors.reset}`, level: "debug" });
  log({ message: `${colors.blue}1.${colors.reset} Run unit tests: ${colors.cyan}npm run test:forecast:unit${colors.reset}`, level: "debug" });
  log({ message: `${colors.blue}2.${colors.reset} Run integration tests: ${colors.cyan}npm run test:forecast:integration${colors.reset}`, level: "debug" });
  log({ message: `${colors.blue}3.${colors.reset} Run performance comparison: ${colors.cyan}npm run test:forecast:performance${colors.reset}`, level: "debug" });
  log({ message: `${colors.blue}4.${colors.reset} Test with your real data by replacing the mock database`, level: "debug" });
  log({ message: "\n", level: "debug" });
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch((error) => log({ message: "Test runner error", data: error, level: "error" }));
}

export { testBasicFunctionality, testCachePerformance, runAllTests };
