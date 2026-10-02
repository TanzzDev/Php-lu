import { ApiError } from './errors.js';

/**
 * Pembatas laju in-memory (fixed window). Sifatnya best-effort: pada serverless
 * setiap instance punya penghitung sendiri. Untuk batas global gunakan Vercel
 * Firewall / rate limiting di edge — lihat docs/SECURITY.md.
 */
export function createRateLimiter({ maxKeys = 20000 } = {}) {
  const buckets = new Map();

  function sweep(now) {
    if (buckets.size < maxKeys) return;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size >= maxKeys) buckets.clear();
  }

  return {
    check(key, { limit, windowMs = 60_000 }, now = Date.now()) {
      sweep(now);
      let b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
      }
      b.count += 1;
      if (b.count > limit) {
        const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
        const err = new ApiError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
        err.retryAfter = retryAfter;
        throw err;
      }
    },
    reset() { buckets.clear(); },
  };
}
