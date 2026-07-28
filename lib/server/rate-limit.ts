export type RateLimitOptions = { limit: number; windowMs: number };
type RateLimitEntry = { count: number; resetAt: number };
const globalRateLimits = globalThis as typeof globalThis & { __challengeSuiteRateLimits?: Map<string, RateLimitEntry> };
const entries = globalRateLimits.__challengeSuiteRateLimits ?? new Map<string, RateLimitEntry>();
globalRateLimits.__challengeSuiteRateLimits = entries;

export function consumeRateLimit(key: string, options: RateLimitOptions, now = Date.now()) {
  if (entries.size > 10_000) {
    for (const [entryKey, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(entryKey);
    }
  }
  const normalizedKey = key.slice(0, 240);
  const current = entries.get(normalizedKey);
  if (!current || current.resetAt <= now) {
    entries.set(normalizedKey, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: Math.max(0, options.limit - 1), retryAfterSeconds: 0 };
  }
  if (current.count >= options.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, remaining: Math.max(0, options.limit - current.count), retryAfterSeconds: 0 };
}
