/**
 * apps/api/src/services/goldRate.service.ts
 *
 * Bonus B1 — Cached Gold Rate.
 *
 * The live 24k gold rate in paise/gram is read from the env on startup.
 * In production you'd replace the `fetchLiveRate()` stub with a call to
 * an MCX / commodity-data API. The cache TTL is 5 minutes.
 *
 * The REST endpoint GET /api/v1/gold-rate returns:
 *   {
 *     "rate24kPerGram": 7000,       // rupees
 *     "rate24kPaise": 700000,       // paise
 *     "cachedAt": "2026-10-22T...", // ISO timestamp
 *     "ttlSeconds": 300
 *   }
 */

interface RateCache {
  rupees: number;
  paise: number;
  cachedAt: Date;
}

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

let _cache: RateCache | null = null;

/** Return the current gold rate, from cache if still fresh. */
export async function getGoldRate(): Promise<RateCache> {
  const now = Date.now();
  if (_cache && now - _cache.cachedAt.getTime() < CACHE_TTL_MS) {
    return _cache;
  }
  const rate = await fetchLiveRate();
  _cache = rate;
  return rate;
}

/** Force-refresh the cache (called on server start and by admin endpoint). */
export async function refreshGoldRate(): Promise<RateCache> {
  const rate = await fetchLiveRate();
  _cache = rate;
  return rate;
}

/**
 * Fetch the live 24k gold rate.
 *
 * Currently reads from the env variable GOLD_RATE_24K_PAISE.
 * Replace `fetchLiveRate` body with an HTTP call to a commodity API
 * (e.g. MCX, metals-api) when going to production.
 */
async function fetchLiveRate(): Promise<RateCache> {
  const raw = process.env["GOLD_RATE_24K_PAISE"];
  if (!raw) throw new Error("GOLD_RATE_24K_PAISE env variable is not set");
  const paise = parseInt(raw, 10);
  if (isNaN(paise) || paise <= 0)
    throw new Error(`Invalid GOLD_RATE_24K_PAISE: "${raw}"`);

  return {
    rupees: paise / 100,
    paise,
    cachedAt: new Date(),
  };
}

/** Serialise the cache entry for the API response. */
export function formatRateResponse(rate: RateCache) {
  const ageMs = Date.now() - rate.cachedAt.getTime();
  const ttlSeconds = Math.max(0, Math.floor((CACHE_TTL_MS - ageMs) / 1000));

  return {
    rate24kPerGram: rate.rupees,
    rate24kPaise: rate.paise,
    cachedAt: rate.cachedAt.toISOString(),
    ttlSeconds,
  };
}
