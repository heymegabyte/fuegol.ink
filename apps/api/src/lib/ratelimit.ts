/**
 * Best-effort per-IP token bucket for demo (keyless) traffic. In-memory + per-isolate,
 * so it is a courtesy throttle, not a hard guarantee — durable limiting via a Durable
 * Object / KV lands with the billing increment. Authenticated traffic is not limited here.
 */
interface Bucket {
  tokens: number;
  updated: number;
}

const BUCKETS = new Map<string, Bucket>();
const CAPACITY = 20; // burst
const REFILL_PER_SEC = 20 / 60; // ~20 requests/minute

export function allowDemo(ip: string, now: number): boolean {
  const bucket = BUCKETS.get(ip) ?? { tokens: CAPACITY, updated: now };
  const elapsed = Math.max(0, (now - bucket.updated) / 1000);
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_SEC);
  bucket.updated = now;
  if (bucket.tokens < 1) {
    BUCKETS.set(ip, bucket);
    return false;
  }
  bucket.tokens -= 1;
  BUCKETS.set(ip, bucket);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (BUCKETS.size > 10000) {
    for (const [k, v] of BUCKETS) if (now - v.updated > 300000) BUCKETS.delete(k);
  }
  return true;
}
