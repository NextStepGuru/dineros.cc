import moment from 'moment';

// Mock the account data
const account = {
  id: 1,
  typeId: 1,
  budgetId: 1,
  accountId: "test-account",
  name: "Test Account",
  balance: 1000,
  latestBalance: 1000,
  minPayment: 100,
  statementAt: moment("2024-01-15"),
  statementIntervalId: 3,
  apr1: 0.05,
  apr1StartAt: null,
  apr2: null,
  apr2StartAt: null,
  apr3: null,
  apr3StartAt: null,
  targetAccountRegisterId: 2,
  loanStartAt: null,
  loanPaymentsPerYear: 12,
  loanTotalYears: 5,
  loanOriginalAmount: 10000,
  loanPaymentSortOrder: 0,
  savingsGoalSortOrder: 0,
  accountSavingsGoal: null,
  minAccountBalance: 0,
  allowExtraPayment: false,
  isArchived: false,
  plaidId: null,
};

const forecastDate = moment("2024-01-15");

console.log("Account:", {
  apr1: account.apr1,
  balance: account.balance,
  statementAt: account.statementAt.format("YYYY-MM-DD"),
});

console.log("Forecast date:", forecastDate.format("YYYY-MM-DD"));

// Test the logic manually
const checkDate = forecastDate;
const statementDate = moment(account.statementAt).utc().set({
  hour: 0,
  minute: 0,
  second: 0,
  milliseconds: 0,
});

const hasAPR = account.apr1 > 0;
const hasBalance = account.balance !== 0;
const isStatementDate = checkDate.isSame(statementDate, "day");

console.log("Debug values:", {
  hasAPR,
  hasBalance,
  isStatementDate,
  checkDate: checkDate.format("YYYY-MM-DD"),
  statementDate: statementDate.format("YYYY-MM-DD"),
});

console.log("Raw moment objects:", {
  checkDate: checkDate.toString(),
  statementDate: statementDate.toString(),
  checkDateISO: checkDate.toISOString(),
  statementDateISO: statementDate.toISOString(),
});

console.log("Result:", hasAPR && hasBalance && isStatementDate);
