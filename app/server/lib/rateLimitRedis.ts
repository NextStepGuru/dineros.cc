import { sharedRedisConnection } from "~/server/clients/redisClient";

export async function rateLimitByKey(options: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  if (process.env.NODE_ENV === "test") {
    return { allowed: true };
  }
  const { key, limit, windowSeconds } = options;
  const count = await sharedRedisConnection.incr(key);
  if (count === 1) {
    await sharedRedisConnection.expire(key, windowSeconds);
  }
  if (count > limit) {
    const ttl = await sharedRedisConnection.ttl(key);
    return {
      allowed: false,
      retryAfterSec: ttl > 0 ? ttl : windowSeconds,
    };
  }
  return { allowed: true };
}

function firstForwardedForClientIp(
  xf: string | string[] | undefined,
): string {
  if (typeof xf === "string") {
    return xf.split(",")[0]?.trim() ?? "";
  }
  if (Array.isArray(xf)) {
    return xf[0]?.split(",")[0]?.trim() ?? "";
  }
  return "";
}

export function clientIpFromEvent(event: { node?: { req?: { headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } } } }): string {
  const h = event.node?.req?.headers;
  const first = firstForwardedForClientIp(h?.["x-forwarded-for"]);
  if (first) return first;
  return event.node?.req?.socket?.remoteAddress ?? "unknown";
}
