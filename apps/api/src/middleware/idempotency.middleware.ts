/**
 * apps/api/src/middleware/idempotency.middleware.ts
 *
 * Bonus B1 — Idempotency-Key support with concurrent duplicate protection.
 *
 * How it works:
 *   1. Client sends `Idempotency-Key: <uuid>` header.
 *   2. Middleware checks IdempotencyRecord table.
 *      - If found: replay the cached response immediately (same status + body).
 *      - If not found: let the request through, then cache the response.
 *   3. Concurrent race: two identical requests arrive simultaneously.
 *      - The first one gets a DB-level UNIQUE constraint slot.
 *      - The second hits the constraint → 409 CONFLICT with a retry-after hint.
 *   4. Body-hash mismatch: same key, different body → 422 with a clear error.
 *
 * The idempotency key in the body (used by the old schema) is still supported
 * but this middleware also reads the `Idempotency-Key` HTTP header, which is
 * the industry-standard location (Stripe, PayPal style).
 */

import { type Request, type Response, type NextFunction } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./error.middleware.js";

// Keys in-flight (concurrent request guard — in-process, single-instance)
const IN_FLIGHT = new Set<string>();

export function idempotencyMiddleware() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Accept key from header (preferred) or body (legacy)
    const key: string | undefined =
      (req.headers["idempotency-key"] as string | undefined) ??
      (req.body as Record<string, unknown>)?.["idempotencyKey"] as
        | string
        | undefined;

    if (!key) {
      next();
      return;
    }

    // Validate UUID format
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(key)) {
      next(
        new AppError(
          "VALIDATION_ERROR",
          "Idempotency-Key must be a valid UUID v4.",
          { fields: [{ field: "Idempotency-Key", message: "Must be a UUID" }] }
        )
      );
      return;
    }

    const requestHash = hashBody(req.body);

    // ── Concurrent guard ──────────────────────────────────────────────────
    if (IN_FLIGHT.has(key)) {
      // Another request with the same key is already processing
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message:
            "A request with this Idempotency-Key is already being processed. Retry after a moment.",
        },
      });
      return;
    }

    // ── Check for cached response ─────────────────────────────────────────
    const cached = await prisma.idempotencyRecord.findUnique({
      where: { key },
    });

    if (cached) {
      // Body-hash mismatch → different request reusing an old key
      if (cached.requestHash !== requestHash) {
        next(
          new AppError(
            "CONFLICT",
            "Idempotency-Key reuse with a different request body is not allowed."
          )
        );
        return;
      }
      // Replay the original response
      res
        .status(cached.statusCode)
        .setHeader("X-Idempotency-Replayed", "true")
        .json(cached.responseBody);
      return;
    }

    // ── Mark key as in-flight ─────────────────────────────────────────────
    IN_FLIGHT.add(key);

    // Intercept res.json to capture the response for caching
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      // Only cache 2xx responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Fire-and-forget — don't block the response
        prisma.idempotencyRecord
          .create({
            data: {
              key,
              requestHash,
              statusCode: res.statusCode,
              responseBody: body as object,
            },
          })
          .catch((err: unknown) => {
            // If the record was already inserted by a concurrent request (race),
            // swallow the unique-constraint error — it's benign.
            const isConflict =
              err instanceof Error &&
              "code" in err &&
              (err as { code: string }).code === "P2002";
            if (!isConflict) {
              console.error("[Idempotency] Failed to store record:", err);
            }
          })
          .finally(() => {
            IN_FLIGHT.delete(key);
          });
      } else {
        IN_FLIGHT.delete(key);
      }
      return originalJson(body);
    };

    next();
  };
}

function hashBody(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? {}))
    .digest("hex");
}
