/** In-memory sliding window limiter for auth endpoints. Replace with Redis when running multiple instances. */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; remaining: number } {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return { allowed: false, remaining: 0 };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { allowed: true, remaining: limit - arr.length };
}

export function resetRateLimits() {
  buckets.clear();
}
