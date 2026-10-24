/**
 * apps/api/src/middleware/error.middleware.ts
 *
 * Strict error contract. Every error response follows this shape:
 *
 * {
 *   "error": {
 *     "code": "VALIDATION_ERROR | NOT_FOUND | DUPLICATE_APPLICATION | INTERNAL_ERROR",
 *     "message": "Human-readable summary",
 *     "fields": [           // present on VALIDATION_ERROR only
 *       { "field": "netWeightGrams", "message": "Net weight cannot exceed gross weight" }
 *     ],
 *     "applicationId": "GL-1042",   // present on DUPLICATE_APPLICATION only
 *     "appliedAt": "2026-10-22T…"   // present on DUPLICATE_APPLICATION only
 *   }
 * }
 *
 * 4xx status codes are mapped from the error code.
 * All unhandled errors become 500 INTERNAL_ERROR.
 */

import { type Request, type Response, type NextFunction } from "express";
import { ZodError } from "zod";

// ── Error codes ───────────────────────────────────────────────────────────────

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_APPLICATION"
  | "INTERNAL_ERROR";

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  DUPLICATE_APPLICATION: 409,
  INTERNAL_ERROR: 500,
};

// ── Field error shape ─────────────────────────────────────────────────────────

export interface FieldError {
  field: string;
  message: string;
}

// ── AppError class ────────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly fields?: FieldError[];
  /** Present for DUPLICATE_APPLICATION: the existing applicationId. */
  public readonly applicationId?: string;
  /** Present for DUPLICATE_APPLICATION: when the original was applied. */
  public readonly appliedAt?: string;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      fields?: FieldError[];
      applicationId?: string;
      appliedAt?: string;
    }
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fields = options?.fields;
    this.applicationId = options?.applicationId;
    this.appliedAt = options?.appliedAt;
  }

  get statusCode(): number {
    return HTTP_STATUS[this.code];
  }

  /** Serialise to the standard error envelope. */
  toResponse(): ErrorEnvelope {
    const error: ErrorBody = {
      code: this.code,
      message: this.message,
    };
    if (this.fields?.length) error.fields = this.fields;
    if (this.applicationId) error.applicationId = this.applicationId;
    if (this.appliedAt) error.appliedAt = this.appliedAt;
    return { error };
  }
}

// ── Response shape (for TypeScript consumers) ─────────────────────────────────

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  fields?: FieldError[];
  applicationId?: string;
  appliedAt?: string;
}

export interface ErrorEnvelope {
  error: ErrorBody;
}

// ── Factory helpers ───────────────────────────────────────────────────────────

export function notFound(resource: string, id: string): AppError {
  return new AppError("NOT_FOUND", `${resource} "${id}" not found.`);
}

export function duplicateApplication(
  applicationId: string,
  appliedAt: Date
): AppError {
  return new AppError(
    "DUPLICATE_APPLICATION",
    "An application for this mobile number was already submitted within the last 7 days.",
    {
      applicationId,
      appliedAt: appliedAt.toISOString(),
    }
  );
}

export function validationError(fields: FieldError[]): AppError {
  return new AppError(
    "VALIDATION_ERROR",
    "Request validation failed. See 'fields' for details.",
    { fields }
  );
}

// ── Zod error → FieldError[] converter ───────────────────────────────────────

export function zodToFieldErrors(err: ZodError): FieldError[] {
  return err.errors.map((issue) => ({
    field: issue.path.join(".") || "request",
    message: issue.message,
  }));
}

// ── Express error handler middleware ─────────────────────────────────────────

/**
 * Must be registered LAST in the middleware chain (4-argument signature).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ── AppError (our own) ────────────────────────────────────────────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toResponse());
    return;
  }

  // ── ZodError (unhandled — shouldn't happen if controllers use safeParse) ──
  if (err instanceof ZodError) {
    const fields = zodToFieldErrors(err);
    const appErr = validationError(fields);
    res.status(appErr.statusCode).json(appErr.toResponse());
    return;
  }

  // ── Prisma unique constraint violation ────────────────────────────────────
  if (
    err instanceof Error &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  ) {
    const meta = (err as { meta?: { target?: string[] } }).meta;
    const field = meta?.target?.join(", ") ?? "field";
    const appErr = validationError([{
      field,
      message: `Unique constraint violation on ${field}.`,
    }]);
    res.status(appErr.statusCode).json(appErr.toResponse());
    return;
  }

  // ── Unknown / unexpected error ────────────────────────────────────────────
  if (process.env["NODE_ENV"] !== "test") {
    console.error("[AppError] Unhandled error:", err);
  }
  const appErr = new AppError("INTERNAL_ERROR", "An unexpected error occurred.");
  res.status(500).json(appErr.toResponse());
}
