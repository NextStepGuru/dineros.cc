# Forecast Engine Logging

The forecast engine now supports configurable logging to control output verbosity.

## Usage

### Disable All Logging

```typescript
const context = {
  accountId: "user-account-123",
  startDate: new Date(),
  endDate: moment().add(5, "years").toDate(),
  logging: {
    enabled: false, // Turn off all forecast engine logging
  },
};
```

### Enable Only Warnings and Errors

```typescript
const context = {
  accountId: "user-account-123",
  startDate: new Date(),
  endDate: moment().add(5, "years").toDate(),
  logging: {
    enabled: true,
    level: "warn", // Only show warnings and errors
  },
};
```

### Enable Debug Logging for Troubleshooting

```typescript
const context = {
  accountId: "user-account-123",
  startDate: new Date(),
  endDate: moment().add(5, "years").toDate(),
  logging: {
    enabled: true,
    level: "debug", // Show all logs including debug info
  },
};
```

## Log Levels

- `debug`: All logs including detailed service information
- `info`: General information and progress updates
- `warn`: Warnings and potential issues
- `error`: Errors only

## Default Behavior

- If no logging configuration is provided, logging is enabled with `info` level
- Service-specific logs (like `[ReoccurrenceService]` and `[TransferService]`) are controlled by the same configuration

## Examples of Controlled Logs

The following logs are now controlled by the logging configuration:

```
[ReoccurrenceService] Processing 0 reoccurrences up to 2030-07-20
[TransferService] Processing savings goals for date: 2029-08-20
[TransferService] All debt paid! Processing savings goals...
[ForecastEngine] Date range: startDate=2024-01-01, endDate=2026-01-01
[ForecastEngine] Starting timeline processing from 2024-01-01 to 2026-01-01
```

To disable these logs, set `logging: { enabled: false }` in your forecast context.
