type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 2000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Returns true when the caller is still within the window. */
export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  prune(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function resetRateLimitForTests() {
  buckets.clear();
}
