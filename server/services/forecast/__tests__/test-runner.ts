#!/usr/bin/env tsx

import { performance } from 'perf_hooks';
import moment from 'moment';
import { ForecastEngineFactory } from '../index';


// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Mock database for testing
const createMockDatabase = () => ({
  accountRegister: {
    findMany: async () => ([
      {
        id: 1,
        budgetId: 1,
        accountId: 'test-account',
        name: 'Test Checking',
        balance: 2500,
        latestBalance: 2500,
        minPayment: null,
        statementAt: moment().add(1, 'month').toDate(),
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
        accountId: 'test-account',
        name: 'Test Credit Card',
        balance: -800,
        latestBalance: -800,
        minPayment: 25,
        statementAt: moment().add(15, 'days').toDate(),
        apr1: 0.18,
        apr1StartAt: moment().subtract(1, 'year').toDate(),
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
    ]),
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  },
  registerEntry: {
    findMany: async () => ([]),
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
    count: async () => 0,
  },
  reoccurrence: {
    findMany: async () => ([
      {
        id: 1,
        accountId: 'test-account',
        accountRegisterId: 1,
        intervalId: 3,
        intervalCount: 1,
        transferAccountRegisterId: null,
        lastAt: moment().startOf('month').toDate(),
        endAt: null,
        amount: 4000,
        description: 'Salary',
        totalIntervals: null,
        elapsedIntervals: null,
        updatedAt: new Date(),
        adjustBeforeIfOnWeekend: false,
      },
      {
        id: 2,
        accountId: 'test-account',
        accountRegisterId: 1,
        intervalId: 3,
        intervalCount: 1,
        transferAccountRegisterId: null,
        lastAt: moment().startOf('month').add(5, 'days').toDate(),
        endAt: null,
        amount: -1500,
        description: 'Rent',
        totalIntervals: null,
        elapsedIntervals: null,
        updatedAt: new Date(),
        adjustBeforeIfOnWeekend: false,
      },
    ]),
    aggregate: async () => ({
      _min: { lastAt: moment().startOf('month').toDate() },
    }),
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  },
  reoccurrenceSkip: {
    findMany: async () => ([]),
  },
} as any);

async function testBasicFunctionality() {
  console.log(`${colors.cyan}${colors.bright}🧪 Testing Basic Functionality${colors.reset}\n`);

  const mockDb = createMockDatabase();
  const engine = ForecastEngineFactory.create(mockDb);

  const context = {
    accountId: 'test-account',
    startDate: moment().startOf('month').toDate(),
    endDate: moment().add(6, 'months').toDate(),
  };

  try {
    const startTime = performance.now();
    const result = await engine.recalculate(context);
    const endTime = performance.now();

    const executionTime = endTime - startTime;

    if (result.isSuccess) {
      console.log(`${colors.green}✅ Forecast calculation successful!${colors.reset}`);
      console.log(`${colors.blue}📊 Results:${colors.reset}`);
      console.log(`   • Execution time: ${executionTime.toFixed(2)}ms`);
      console.log(`   • Register entries: ${result.registerEntries.length}`);
      console.log(`   • Account registers: ${result.accountRegisters.length}`);

      // Analyze results
      const balanceEntries = result.registerEntries.filter(e => e.isBalanceEntry);
      const projectedEntries = result.registerEntries.filter(e => e.isProjected);
      const pendingEntries = result.registerEntries.filter(e => e.isPending);

      console.log(`   • Balance entries: ${balanceEntries.length}`);
      console.log(`   • Projected entries: ${projectedEntries.length}`);
      console.log(`   • Pending entries: ${pendingEntries.length}`);

      // Show sample entries
      console.log(`\n${colors.blue}📝 Sample Entries:${colors.reset}`);
      result.registerEntries.slice(0, 5).forEach((entry, i) => {
        const date = moment(entry.createdAt).format('YYYY-MM-DD');
        const amount = entry.amount >= 0 ? `+$${entry.amount.toFixed(2)}` : `-$${Math.abs(entry.amount).toFixed(2)}`;
        console.log(`   ${i + 1}. ${date} | ${entry.description} | ${amount} | Balance: $${entry.balance.toFixed(2)}`);
      });

    } else {
      console.log(`${colors.red}❌ Forecast calculation failed!${colors.reset}`);
      if (result.errors) {
        result.errors.forEach(error => {
          console.log(`   ${colors.red}Error: ${error}${colors.reset}`);
        });
      }
    }
  } catch (error) {
    console.log(`${colors.red}❌ Test failed with error: ${error}${colors.reset}`);
  }

  console.log('\n');
}

async function testCachePerformance() {
  console.log(`${colors.magenta}${colors.bright}⚡ Testing Cache Performance${colors.reset}\n`);

  const mockDb = createMockDatabase();
  const engine = ForecastEngineFactory.create(mockDb);
  const cache = engine.getCache();

  // Test cache insertion performance
  console.log(`${colors.blue}Testing cache insertion performance...${colors.reset}`);
  const insertStart = performance.now();

  for (let i = 1; i <= 1000; i++) {
    cache.accountRegister.insert({
      id: i,
      typeId: i % 5 + 1,
      budgetId: 1,
      accountId: 'perf-test',
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
  console.log(`${colors.green}✅ Inserted 1,000 accounts in ${insertTime.toFixed(2)}ms${colors.reset}`);

  // Test query performance
  console.log(`${colors.blue}Testing query performance...${colors.reset}`);
  const queryStart = performance.now();

  for (let i = 0; i < 100; i++) {
    const randomType = Math.floor(Math.random() * 5) + 1;
    const results = cache.accountRegister.find({ typeId: randomType });
    // Do something with results to prevent optimization
    if (results.length === 0) console.log('No results');
  }

  const queryTime = performance.now() - queryStart;
  console.log(`${colors.green}✅ Completed 100 queries in ${queryTime.toFixed(2)}ms${colors.reset}`);

  // Test chained operations
  console.log(`${colors.blue}Testing chained operations...${colors.reset}`);
  const chainStart = performance.now();

  const chainedResults = cache.accountRegister
    .chain()
    .find(account => account.balance > 5000)
    .simplesort('balance', true)
    .limit(10)
    .data();

  const chainTime = performance.now() - chainStart;
  console.log(`${colors.green}✅ Chained operation completed in ${chainTime.toFixed(2)}ms${colors.reset}`);
  console.log(`   Found ${chainedResults.length} accounts with balance > $5,000`);

  // Show cache statistics
  const stats = cache.getStats();
  console.log(`\n${colors.blue}📊 Cache Statistics:${colors.reset}`);
  console.log(`   • Account Registers: ${stats.accountRegisters}`);
  console.log(`   • Register Entries: ${stats.registerEntries}`);
  console.log(`   • Reoccurrences: ${stats.reoccurrences}`);
  console.log(`   • Reoccurrence Skips: ${stats.reoccurrenceSkips}`);

  console.log('\n');
}

async function runAllTests() {
  console.log(`${colors.bright}${colors.green}🚀 Forecast Engine Test Suite${colors.reset}\n`);
  console.log(`${colors.yellow}Testing the new ModernCacheService-based forecast system...${colors.reset}\n`);

  // Run basic functionality test
  await testBasicFunctionality();

  // Run cache performance test
  await testCachePerformance();

  console.log(`${colors.bright}${colors.green}✨ All tests completed!${colors.reset}\n`);

  // Show next steps
  console.log(`${colors.blue}${colors.bright}🎯 Next Steps:${colors.reset}`);
  console.log(`${colors.blue}1.${colors.reset} Run unit tests: ${colors.cyan}npm run test:forecast:unit${colors.reset}`);
  console.log(`${colors.blue}2.${colors.reset} Run integration tests: ${colors.cyan}npm run test:forecast:integration${colors.reset}`);
  console.log(`${colors.blue}3.${colors.reset} Run performance comparison: ${colors.cyan}npm run test:forecast:performance${colors.reset}`);
  console.log(`${colors.blue}4.${colors.reset} Test with your real data by replacing the mock database`);
  console.log('\n');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { testBasicFunctionality, testCachePerformance, runAllTests };
