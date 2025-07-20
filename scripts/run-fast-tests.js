#!/usr/bin/env node

/**
 * Fast Test Runner
 *
 * Runs only the fastest tests for quick development feedback.
 * Excludes slow cryptographic tests and complex integration tests.
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Ultra-fast test patterns (tests that run under 300ms)
const fastTestPatterns = [
  'server/api/__tests__/authEndpoints.test.ts',
  'server/api/__tests__/coreEndpoints.test.ts',
  'server/api/__tests__/accountEndpoints.test.ts',
  'server/api/__tests__/reoccurrenceEndpoints.test.ts',
  'server/api/__tests__/recalculateEndpoints.test.ts',
  'server/api/__tests__/registerEndpoint.test.ts',
  'server/api/__tests__/twoFactorAuthEndpoints.test.ts',
  'server/lib/__tests__/serverLibraries.test.ts',
  'server/lib/__tests__/queueManager.test.ts',
  'server/lib/__tests__/cronDisabled.test.ts',
  'lib/__tests__/auth.test.ts',
  'lib/__tests__/utils.test.ts',
  'pages/__tests__/login.simple.test.ts',
  'tests/sort.test.ts',
  'server/services/forecast/__tests__/AccountRegisterService.test.ts',
  'server/services/forecast/__tests__/DataPersisterService.test.ts',
  'server/services/forecast/__tests__/LoanCalculatorService.test.ts',
  'server/services/forecast/__tests__/ModernCacheService.test.ts',
  'server/services/forecast/__tests__/ReoccurrenceService.test.ts',
  'server/services/forecast/__tests__/TransferService.test.ts',
  'server/services/forecast/__tests__/dataLoaderService.unit.test.ts',
  'server/services/forecast/__tests__/index.test.ts',
  'server/services/forecast/__tests__/modernCache.unit.test.ts',
];

const testArgs = fastTestPatterns.map(pattern => `"${pattern}"`).join(' ');

console.log('🚀 Running ultra-fast tests only...');
console.log('⏱️  Expected time: 1-2 seconds');

try {
  execSync(`cd "${projectRoot}" && pnpm vitest --run --silent=true ${testArgs}`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      RUN_SLOW_TESTS: 'false',
      RUN_EDGE_CASE_TESTS: 'false',
    }
  });
  console.log('✅ Fast tests completed successfully!');
} catch (error) {
  console.error('❌ Fast tests failed:', error.message);
  process.exit(1);
}
