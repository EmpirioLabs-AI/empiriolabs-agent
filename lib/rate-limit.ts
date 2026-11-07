import "server-only";
import { LIMITS } from "./limits";

// Shared across requests on purpose. Addresses live here for one window at most
// and are never logged. The count is per server instance: on a platform that
// runs several instances, each one keeps its own.
const recentRequests = new Map<string, number[]>();
const MAX_TRACKED_ADDRESSES = 10_000;

/** The client address the hosting platform reports for a request. */
export function clientAddress(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/**
 * Counts a chat request from `address`. Returns 0 when it may proceed, or the
 * number of seconds to wait before the next one is allowed.
 */
export function takeRateLimit(address: string, now = Date.now()): number {
  const windowStart = now - LIMITS.rateLimitWindowMs;
  const recent = (recentRequests.get(address) ?? []).filter((time) => time > windowStart);
  recentRequests.delete(address);

  if (recent.length >= LIMITS.rateLimitRequests) {
    recentRequests.set(address, recent);
    return Math.max(1, Math.ceil((recent[0] + LIMITS.rateLimitWindowMs - now) / 1000));
  }

  recent.push(now);
  recentRequests.set(address, recent);
  if (recentRequests.size > MAX_TRACKED_ADDRESSES) forgetIdle(windowStart);
  return 0;
}

function forgetIdle(windowStart: number) {
  for (const [address, times] of recentRequests) {
    if ((times.at(-1) ?? 0) <= windowStart) recentRequests.delete(address);
  }
  // Still too many: the Map keeps insertion order, so the first entries are the stalest.
  for (const address of recentRequests.keys()) {
    if (recentRequests.size <= MAX_TRACKED_ADDRESSES) break;
    recentRequests.delete(address);
  }
}
