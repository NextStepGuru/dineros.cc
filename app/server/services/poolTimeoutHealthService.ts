import { dateTimeService } from "~/server/services/forecast/DateTimeService";

const POOL_TIMEOUT_WINDOW_MS = 60_000;
const POOL_TIMEOUT_FAILURE_THRESHOLD = 5;
const POOL_TIMEOUT_ERROR_PATTERN =
  /pool timeout: failed to retrieve a connection from pool/i;

class PoolTimeoutHealthService {
  private timestampsMs: number[] = [];

  private nowMs(): number {
    return dateTimeService.now().toDate().getTime();
  }

  private prune(nowMs: number): void {
    const cutoffMs = nowMs - POOL_TIMEOUT_WINDOW_MS;
    this.timestampsMs = this.timestampsMs.filter(
      (timestampMs) => timestampMs >= cutoffMs,
    );
  }

  record(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (!POOL_TIMEOUT_ERROR_PATTERN.test(message)) return;

    const nowMs = this.nowMs();
    this.prune(nowMs);
    this.timestampsMs.push(nowMs);
  }

  isLive(): boolean {
    const nowMs = this.nowMs();
    this.prune(nowMs);
    return this.timestampsMs.length < POOL_TIMEOUT_FAILURE_THRESHOLD;
  }

  getState(): {
    recentPoolTimeoutCount: number;
    threshold: number;
    windowMs: number;
  } {
    const nowMs = this.nowMs();
    this.prune(nowMs);
    return {
      recentPoolTimeoutCount: this.timestampsMs.length,
      threshold: POOL_TIMEOUT_FAILURE_THRESHOLD,
      windowMs: POOL_TIMEOUT_WINDOW_MS,
    };
  }
}

export const poolTimeoutHealthService = new PoolTimeoutHealthService();
