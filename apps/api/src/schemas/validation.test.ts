/**
 * apps/api/src/schemas/validation.test.ts
 * Tests for the shared Zod validation schemas.
 */

import { describe, it, expect } from "vitest";
import { createLeadSchema, agentSubmitLeadSchema } from "./validation.js";

const VALID_BASE = {
  fullName: "Ananya Krishnamurthy",
  mobileNumber: "9876540001",
  grossWeightGrams: 25.5,
  netWeightGrams: 24.0,
  karat: 22 as const,
  planId: "PLAN_EMI_01",
};

describe("createLeadSchema", () => {
  it("accepts a valid lead", () => {
    const r = createLeadSchema.safeParse(VALID_BASE);
    expect(r.success).toBe(true);
  });

  it("rejects fullName with numbers", () => {
    const r = createLeadSchema.safeParse({ ...VALID_BASE, fullName: "Ananya123" });
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.errors.map((e) => e.path[0]);
    expect(fields).toContain("fullName");
  });

  it("rejects fullName shorter than 2 chars", () => {
    const r = createLeadSchema.safeParse({ ...VALID_BASE, fullName: "A" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid Indian mobile number", () => {
    const r = createLeadSchema.safeParse({ ...VALID_BASE, mobileNumber: "1234567890" });
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.errors.map((e) => e.path[0]);
    expect(fields).toContain("mobileNumber");
  });

  it("rejects mobile numbers starting with 5", () => {
    const r = createLeadSchema.safeParse({ ...VALID_BASE, mobileNumber: "5876540001" });
    expect(r.success).toBe(false);
  });

  it("rejects negative grossWeightGrams", () => {
    const r = createLeadSchema.safeParse({ ...VALID_BASE, grossWeightGrams: -1 });
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.errors.map((e) => e.path[0]);
    expect(fields).toContain("grossWeightGrams");
  });

  it("rejects netWeightGrams > grossWeightGrams with correct path", () => {
    const r = createLeadSchema.safeParse({
      ...VALID_BASE,
      grossWeightGrams: 10,
      netWeightGrams: 15, // net > gross
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.errors.find((e) => e.path[0] === "netWeightGrams");
      expect(issue).toBeDefined();
      expect(issue?.message).toBe("Net weight cannot exceed gross weight");
    }
  });

  it("rejects karat 21", () => {
    const r = createLeadSchema.safeParse({ ...VALID_BASE, karat: 21 });
    expect(r.success).toBe(false);
  });

  it("accepts karat 18, 22, 24", () => {
    for (const karat of [18, 22, 24] as const) {
      const r = createLeadSchema.safeParse({ ...VALID_BASE, karat });
      expect(r.success).toBe(true);
    }
  });

  it("rejects empty planId", () => {
    const r = createLeadSchema.safeParse({ ...VALID_BASE, planId: "" });
    expect(r.success).toBe(false);
  });

  it("defaults source to WEB_FORM when omitted", () => {
    const r = createLeadSchema.safeParse(VALID_BASE);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source).toBe("WEB_FORM");
  });

  it("rejects non-UUID idempotencyKey", () => {
    const r = createLeadSchema.safeParse({ ...VALID_BASE, idempotencyKey: "not-a-uuid" });
    expect(r.success).toBe(false);
  });

  it("accepts valid UUID idempotencyKey", () => {
    const r = createLeadSchema.safeParse({
      ...VALID_BASE,
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(r.success).toBe(true);
  });
});

describe("agentSubmitLeadSchema", () => {
  it("accepts valid agent payload", () => {
    const r = agentSubmitLeadSchema.safeParse(VALID_BASE);
    expect(r.success).toBe(true);
  });

  it("enforces same net > gross refinement as REST schema", () => {
    const r = agentSubmitLeadSchema.safeParse({
      ...VALID_BASE,
      grossWeightGrams: 10,
      netWeightGrams: 12,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.errors.find((e) => e.path[0] === "netWeightGrams");
      expect(issue?.message).toBe("Net weight cannot exceed gross weight");
    }
  });
});
