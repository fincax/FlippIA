/** In-memory sliding window limiter for auth endpoints. Replace with Redis when running multiple instances. */
const buckets = new Map<string, number[]>();
const PRUNE_EVERY_MS = 5 * 60 * 1000;
let lastPrune = 0;

/** Drop keys whose window has fully expired so the map does not grow forever. */
function prune(now: number, windowMs: number) {
  if (now - lastPrune < PRUNE_EVERY_MS) return;
  lastPrune = now;
  for (const [key, hits] of buckets) {
    if (!hits.some((t) => now - t < windowMs)) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; remaining: number } {
  prune(now, windowMs);
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
