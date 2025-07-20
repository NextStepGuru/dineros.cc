// Export all types
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

// Factory for creating forecast engine
import type { PrismaClient } from "@prisma/client";
import { ForecastEngine } from "./ForecastEngine";

export class ForecastEngineFactory {
  static create(db: PrismaClient): ForecastEngine {
    return new ForecastEngine(db);
  }

  static createWithCustomServices(
    db: PrismaClient,
    customServices?: {
      // Allow for dependency injection of custom implementations
      // This enables testing with mocks and different configurations
    }
  ): ForecastEngine {
    // For now, just return the standard engine
    // In the future, this could support custom service injection
    return new ForecastEngine(db);
  }
}
