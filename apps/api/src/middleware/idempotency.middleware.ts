/**
 * apps/api/src/middleware/idempotency.middleware.ts
 *
 * Bonus B1 — Idempotency-Key check middleware.
 *
 * This middleware only handles the READ path (cache hit → replay).
 * The WRITE path (storing the response) is done explicitly in the route
 * handler BEFORE the response is sent, so there's no race condition.
 *
 * Usage in routes:
 *   router.post("/", idempotencyMiddleware(), async (req, res, next) => {
 *     // ... handle request ...
 *     // Before res.json():
 *     await storeIdempotencyResponse(req, res.statusCode, responseBody);
 *     return res.status(201).json(responseBody);
 *   });
 */

import { type Request, type Response, type NextFunction } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./error.middleware.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extract idempotency key from header or body. */
export function getIdempotencyKey(req: Request): string | undefined {
  return (
    (req.headers["idempotency-key"] as string | undefined) ??
    ((req.body as Record<string, unknown>)?.["idempotencyKey"] as string | undefined)
  );
}

/** SHA-256 of request body. */
export function hashBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

/**
 * Middleware: check for a cached idempotency response.
 * If found, replay it immediately and end the request.
 * Otherwise, attach `req._idempotencyKey` and proceed.
 */
export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = getIdempotencyKey(req);
    if (!key) { next(); return; }

    if (!UUID_RE.test(key)) {
      next(new AppError("VALIDATION_ERROR", "Idempotency-Key must be a valid UUID v4.",
        { fields: [{ field: "Idempotency-Key", message: "Must be a UUID" }] }));
      return;
    }

    try {
      const cached = await prisma.idempotencyRecord.findUnique({ where: { key } });
      if (cached) {
        if (cached.requestHash !== hashBody(req.body)) {
          return void next(new AppError("VALIDATION_ERROR",
            "Idempotency-Key reuse with different body is not allowed.",
            { fields: [{ field: "Idempotency-Key", message: "A key cannot be reused with a different request body." }] }));
        }
        res.status(cached.statusCode).setHeader("X-Idempotency-Replayed", "true").json(cached.responseBody);
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Store an idempotency response record.
 * Call this BEFORE sending res.json() in the route handler.
 */
export async function storeIdempotencyResponse(
  req: Request,
  statusCode: number,
  responseBody: unknown
): Promise<void> {
  const key = getIdempotencyKey(req);
  if (!key) return;
  try {
    await prisma.idempotencyRecord.create({
      data: { key, requestHash: hashBody(req.body), statusCode, responseBody: responseBody as object },
    });
  } catch (err: unknown) {
    const isP2002 = err instanceof Error && "code" in err && (err as {code:string}).code === "P2002";
    if (!isP2002) throw err; // re-throw non-conflict errors
  }
}
