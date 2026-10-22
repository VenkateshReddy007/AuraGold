/**
 * apps/api/src/schemas/validation.ts
 *
 * Shared Zod validation schemas used by BOTH the REST controllers
 * and the AI Agent tools. Single source of truth.
 *
 * All field names and error messages match the API error contract exactly.
 */

import { z } from "zod";

// ── Individual field schemas ──────────────────────────────────────────────────

export const fullNameSchema = z
  .string({ required_error: "Full name is required" })
  .trim()
  .regex(/^[A-Za-z\s]{2,60}$/, {
    message: "Full name must be 2–60 characters, letters and spaces only",
  });

export const mobileNumberSchema = z
  .string({ required_error: "Mobile number is required" })
  .trim()
  .regex(/^[6-9]\d{9}$/, {
    message: "Must be a valid 10-digit Indian mobile number starting with 6–9",
  });

export const grossWeightGramsSchema = z
  .number({
    required_error: "Gross weight is required",
    invalid_type_error: "Gross weight must be a number",
  })
  .gt(0, { message: "Gross weight must be greater than 0" })
  .max(1000, { message: "Gross weight cannot exceed 1000g" });

export const netWeightGramsSchema = z
  .number({
    required_error: "Net weight is required",
    invalid_type_error: "Net weight must be a number",
  })
  .gt(0, { message: "Net weight must be greater than 0" })
  .max(1000, { message: "Net weight cannot exceed 1000g" });

export const karatSchema = z.union(
  [z.literal(18), z.literal(22), z.literal(24)],
  {
    errorMap: () => ({ message: "Karat must be 18, 22, or 24" }),
  }
);

export const planIdSchema = z
  .string({ required_error: "Plan ID is required" })
  .min(1, { message: "Plan ID cannot be empty" });

// ── Composite create-lead schema ──────────────────────────────────────────────

/**
 * Full lead submission schema with cross-field refinement.
 * The net > gross refinement attaches the error to `netWeightGrams`
 * so the error contract field path is correct.
 */
export const createLeadSchema = z
  .object({
    fullName: fullNameSchema,
    mobileNumber: mobileNumberSchema,
    grossWeightGrams: grossWeightGramsSchema,
    netWeightGrams: netWeightGramsSchema,
    karat: karatSchema,
    planId: planIdSchema,
    source: z.enum(["WEB_FORM", "AI_AGENT"]).default("WEB_FORM"),
    idempotencyKey: z.string().uuid({ message: "Idempotency key must be a valid UUID" }).optional(),
  })
  .refine((data) => data.netWeightGrams <= data.grossWeightGrams, {
    message: "Net weight cannot exceed gross weight",
    path: ["netWeightGrams"],
  });

// ── Status update schema ──────────────────────────────────────────────────────

/** Valid workflow transitions. */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: [],    // terminal
  REJECTED: [],    // terminal
};

export const updateLeadStatusSchema = z.object({
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"], {
    errorMap: () => ({
      message: "Status must be SUBMITTED, UNDER_REVIEW, APPROVED, or REJECTED",
    }),
  }),
  actor: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
});

// ── AI-agent tool schemas (strict subset, re-exported) ────────────────────────

/**
 * Schema for the AI agent's `submit_lead` tool call.
 * Identical to createLeadSchema but with source forced to AI_AGENT.
 */
export const agentSubmitLeadSchema = z
  .object({
    fullName: fullNameSchema,
    mobileNumber: mobileNumberSchema,
    grossWeightGrams: grossWeightGramsSchema,
    netWeightGrams: netWeightGramsSchema,
    karat: karatSchema,
    planId: planIdSchema,
  })
  .refine((data) => data.netWeightGrams <= data.grossWeightGrams, {
    message: "Net weight cannot exceed gross weight",
    path: ["netWeightGrams"],
  });

/** Schema for the AI agent's `calculate_loan` tool call. */
export const agentCalculateLoanSchema = z.object({
  netWeightGrams: netWeightGramsSchema,
  karat: karatSchema,
  planId: planIdSchema,
});

/** Schema for the AI agent's `get_lead_status` tool call. */
export const agentGetLeadStatusSchema = z.object({
  applicationId: z.string().min(1),
});

// ── Type exports ──────────────────────────────────────────────────────────────

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type AgentSubmitLeadInput = z.infer<typeof agentSubmitLeadSchema>;
export type AgentCalculateLoanInput = z.infer<typeof agentCalculateLoanSchema>;
