import type { PrismaClient } from "@prisma/client";
import { ForecastEngine } from "./ForecastEngine";

// Export all types
// Factory for creating forecast engine
export * from "./types";

// Export all services
export { DataLoaderService } from "./DataLoaderService";
export { AccountRegisterService } from "./AccountRegisterService";
export { ReoccurrenceService } from "./ReoccurrenceService";
export { RegisterEntryService } from "./RegisterEntryService";
export { LoanCalculatorService } from "./LoanCalculatorService";
export { TransferService } from "./TransferService";
export { DataPersisterService } from "./DataPersisterService";
export { ForecastEngine } from "./ForecastEngine";
export { DateTimeService, dateTimeService } from "./DateTimeService";

export const ForecastEngineFactory = {
  create(db: PrismaClient): ForecastEngine {
    return new ForecastEngine(db);
  },

  createWithCustomServices(db: PrismaClient): ForecastEngine {
    // For now, just return the standard engine
    // In the future, this could support custom service injection
    return new ForecastEngine(db);
  },
};

export { forecastLogger } from "./logger";
