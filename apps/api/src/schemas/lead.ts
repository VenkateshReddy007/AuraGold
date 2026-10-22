/**
 * apps/api/src/schemas/lead.ts
 * Zod schemas for Lead-related request bodies.
 */

import { z } from "zod";

export const createLeadSchema = z.object({
  fullName: z.string().min(2).max(120),
  mobileNumber: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Must be a valid 10-digit Indian mobile number"),
  grossWeightGrams: z.number().positive().max(1000),
  netWeightGrams: z.number().positive().max(1000),
  karat: z.union([z.literal(18), z.literal(22), z.literal(24)]),
  planId: z.string().min(1),
  source: z.enum(["WEB_FORM", "AI_AGENT"]).optional(),
  idempotencyKey: z.string().uuid().optional(),
}).refine(
  (data) => data.netWeightGrams <= data.grossWeightGrams,
  {
    message: "netWeightGrams cannot exceed grossWeightGrams",
    path: ["netWeightGrams"],
  }
);

export const updateLeadStatusSchema = z.object({
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"]),
  actor: z.string().min(1).optional(),
  note: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
