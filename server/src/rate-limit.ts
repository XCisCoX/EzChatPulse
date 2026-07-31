// Simple in-memory sliding-window rate limiter (per key).
// Good enough for a single-process server; swap for Redis in a multi-node deploy.

const buckets = new Map<string, number[]>();

/** Returns true if the call is allowed, false if over the limit. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

/** Drop all state (used in tests). */
export function resetRateLimits(): void {
  buckets.clear();
}
