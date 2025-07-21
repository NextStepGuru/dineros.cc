import type { ForecastLoggingConfig } from "./types";

class ForecastLogger {
  private config: ForecastLoggingConfig = {
    enabled: true,
    level: "info",
  };

  setConfig(config: ForecastLoggingConfig): void {
    this.config = { ...this.config, ...config };
  }

  private shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
    if (!this.config.enabled) return false;

    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[this.config.level || "info"];
    const messageLevel = levels[level];

    return messageLevel >= configLevel;
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog("debug")) {
      console.log(`[ForecastEngine] ${message}`, data || "");
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog("info")) {
      console.log(`[ForecastEngine] ${message}`, data || "");
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog("warn")) {
      console.warn(`[ForecastEngine] ${message}`, data || "");
    }
  }

  error(message: string, data?: any): void {
    if (this.shouldLog("error")) {
      console.error(`[ForecastEngine] ${message}`, data || "");
    }
  }

  service(serviceName: string, message: string, data?: any): void {
    if (this.shouldLog("info")) {
      console.log(`[${serviceName}] ${message}`, data || "");
    }
  }

  serviceDebug(serviceName: string, message: string, data?: any): void {
    if (this.shouldLog("debug")) {
      console.log(`[${serviceName}] ${message}`, data || "");
    }
  }
}

export const forecastLogger = new ForecastLogger();
