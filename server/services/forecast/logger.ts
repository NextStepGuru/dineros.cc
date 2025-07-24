import type { ForecastLoggingConfig } from "./types";
import { log } from "../../logger";

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
      log({
        message: `[ForecastEngine] ${message}`,
        data: data || "",
        level: "debug",
      });
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog("info")) {
      log({
        message: `[ForecastEngine] ${message}`,
        data: data || "",
        level: "debug",
      });
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog("warn")) {
      log({
        message: `[ForecastEngine] ${message}`,
        data: data || "",
        level: "warn",
      });
    }
  }

  error(message: string, data?: any): void {
    if (this.shouldLog("error")) {
      log({
        message: `[ForecastEngine] ${message}`,
        data: data || "",
        level: "error",
      });
    }
  }

  service(serviceName: string, message: string, data?: any): void {
    if (this.shouldLog("info")) {
      log({
        message: `[${serviceName}] ${message}`,
        data: data || "",
        level: "debug",
      });
    }
  }

  serviceDebug(serviceName: string, message: string, data?: any): void {
    if (this.shouldLog("debug")) {
      log({
        message: `[${serviceName}] ${message}`,
        data: data || "",
        level: "debug",
      });
    }
  }
}

export const forecastLogger = new ForecastLogger();
