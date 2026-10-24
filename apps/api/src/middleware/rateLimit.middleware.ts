import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Small dependency-free per-process limiter for sensitive write endpoints. */
export function rateLimit(options: { windowMs?: number; max?: number; scope: string }) {
  const windowMs = positiveInt(options.windowMs ?? process.env["RATE_LIMIT_WINDOW_MS"], 60_000);
  const max = positiveInt(options.max, 20);
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env["NODE_ENV"] === "test") return next();
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${options.scope}:${ip}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) { bucket = { count: 0, resetAt: now + windowMs }; buckets.set(key, bucket); }
    bucket.count += 1;
    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", Math.max(0, max - bucket.count));
    res.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));
    if (bucket.count > max) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." } });
    }
    if (buckets.size > 10_000) for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
    return next();
  };
}

function positiveInt(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
