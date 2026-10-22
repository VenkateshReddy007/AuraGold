/**
 * apps/api/src/middleware/error.middleware.test.ts
 * Tests for AppError and the error contract serialisation.
 */

import { describe, it, expect } from "vitest";
import {
  AppError,
  notFound,
  duplicateApplication,
  validationError,
  conflictError,
  zodToFieldErrors,
} from "./error.middleware.js";
import { ZodError } from "zod";
import { createLeadSchema } from "../schemas/validation.js";

describe("AppError", () => {
  it("produces correct status code for each code", () => {
    expect(new AppError("VALIDATION_ERROR", "x").statusCode).toBe(422);
    expect(new AppError("NOT_FOUND", "x").statusCode).toBe(404);
    expect(new AppError("DUPLICATE_APPLICATION", "x").statusCode).toBe(409);
    expect(new AppError("CONFLICT", "x").statusCode).toBe(409);
    expect(new AppError("INTERNAL_ERROR", "x").statusCode).toBe(500);
  });

  it("toResponse() wraps in error envelope", () => {
    const err = new AppError("NOT_FOUND", "Lead not found.");
    const resp = err.toResponse();
    expect(resp).toHaveProperty("error.code", "NOT_FOUND");
    expect(resp).toHaveProperty("error.message", "Lead not found.");
    expect(resp.error).not.toHaveProperty("fields");
  });

  it("toResponse() includes fields when provided", () => {
    const err = validationError([{ field: "karat", message: "Must be 18, 22, or 24" }]);
    const resp = err.toResponse();
    expect(resp.error.fields).toHaveLength(1);
    expect(resp.error.fields?.[0]).toEqual({ field: "karat", message: "Must be 18, 22, or 24" });
  });
});

describe("notFound()", () => {
  it("returns 404 AppError", () => {
    const err = notFound("Lead", "GL-9999");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toContain("GL-9999");
  });
});

describe("duplicateApplication()", () => {
  it("includes applicationId and appliedAt in response", () => {
    const date = new Date("2026-10-01T10:00:00Z");
    const err = duplicateApplication("GL-1042", date);
    const resp = err.toResponse();
    expect(resp.error.code).toBe("DUPLICATE_APPLICATION");
    expect(resp.error.applicationId).toBe("GL-1042");
    expect(resp.error.appliedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(err.statusCode).toBe(409);
  });
});

describe("conflictError()", () => {
  it("returns 409 CONFLICT", () => {
    const err = conflictError("Cannot transition from APPROVED to SUBMITTED.");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });
});

describe("zodToFieldErrors()", () => {
  it("converts ZodError issues to FieldError[]", () => {
    const result = createLeadSchema.safeParse({
      fullName: "A",            // too short
      mobileNumber: "123",      // invalid
      grossWeightGrams: -1,
      netWeightGrams: 5,
      karat: 21,
      planId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = zodToFieldErrors(result.error as ZodError);
      expect(fields.length).toBeGreaterThan(0);
      fields.forEach((f) => {
        expect(f).toHaveProperty("field");
        expect(f).toHaveProperty("message");
        expect(typeof f.field).toBe("string");
        expect(typeof f.message).toBe("string");
      });
    }
  });
});
