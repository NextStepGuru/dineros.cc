# Quick Test Commands

## 🚀 Immediate Testing (Copy & Paste)

### 1. Test Everything (Recommended First Step)
```bash
npm run test:forecast:all
```

### 2. Quick Functionality Test
```bash
npm run test:forecast
```

### 3. Performance Testing
```bash
npm run test:forecast:performance
```

### 4. Individual Test Suites
```bash
# Unit tests only
npm run test:forecast:unit

# Integration tests only
npm run test:forecast:integration
```

### 5. Watch Mode (During Development)
```bash
npm run test:forecast:watch
```

## ⚡ What to Expect

### ✅ Success Indicators
```
✅ Forecast calculation successful!
📊 Results:
   • Execution time: 45.23ms
   • Register entries: 127
   • Account registers: 3
   • Balance entries: 3
   • Projected entries: 98
   • Pending entries: 26
```

### 🎯 Performance Targets
- **Execution time**: < 100ms
- **Cache operations**: < 10ms for 100 queries
- **Memory usage**: 60% less than LokiJS
- **All tests**: Passing

### ⚠️ Red Flags
- Execution time > 500ms
- Test failures or errors
- Memory usage increasing significantly
- Incorrect balance calculations

## 🔧 Quick Fixes

### Test Failures?
```bash
# Check dependencies
npm install

# Clear cache and retry
rm -rf node_modules/.cache
npm run test:forecast:unit
```

### Slow Performance?
```bash
# Check memory usage
node --inspect server/services/forecast/__tests__/test-runner.ts
```

### Need Debug Info?
```bash
# Enable debug logging
DEBUG=forecast:* npm run test:forecast
```

## 📊 Reading Test Results

### Cache Performance Output
```
⚡ Testing Cache Performance

Testing cache insertion performance...
✅ Inserted 1,000 accounts in 23.45ms

Testing query performance...
✅ Completed 100 queries in 2.34ms

Testing chained operations...
✅ Chained operation completed in 0.89ms
   Found 15 accounts with balance > $5,000

📊 Cache Statistics:
   • Account Registers: 1000
   • Register Entries: 0
   • Reoccurrences: 0
   • Reoccurrence Skips: 0
```

### Integration Test Output
```
🧪 Testing Basic Functionality

✅ Forecast calculation successful!
📊 Results:
   • Execution time: 45.23ms
   • Register entries: 127
   • Account registers: 3

📝 Sample Entries:
   1. 2024-01-01 | Latest Balance | +$0.00 | Balance: $2500.00
   2. 2024-01-01 | Monthly Salary | +$4000.00 | Balance: $6500.00
   3. 2024-01-06 | Monthly Rent | -$1500.00 | Balance: $5000.00
   4. 2024-01-15 | Interest Charge | -$12.00 | Balance: $4988.00
   5. 2024-01-15 | Min Payment to Credit Card | +$25.00 | Balance: $5013.00
```

## ✨ Next Steps After Testing

1. **All Tests Pass?** → Ready to integrate into your app
2. **Performance Good?** → Consider removing old LokiJS dependency
3. **Results Match?** → Update your recalculate endpoint
4. **Need Tweaks?** → Modify individual services as needed

---

💡 **Pro Tip**: Run `npm run test:forecast:all` first - it covers everything in the right order!
