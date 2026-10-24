import { z } from "zod";
import { createLeadSchema, mobileNumberSchema, quoteInputSchema, planIdSchema } from "../schemas/validation.js";
import { AppError, validationError, zodToFieldErrors } from "../middleware/error.middleware.js";
import { checkExistingApplication, filterLeadsSafe, submitLead, type SafeLeadFilter } from "../services/lead.service.js";
import { calculateQuote } from "../services/quote.service.js";
import { listActiveSchemes } from "../services/scheme.service.js";

const checkApplicationSchema = z.object({ mobileNumber: mobileNumberSchema });
const submitApplicationSchema = createLeadSchema.and(z.object({ userConfirmed: z.boolean() }));
export const safeLeadFilterSchema = z.object({
  planId: planIdSchema.optional(),
  karat: z.union([z.literal(18), z.literal(22), z.literal(24)]).optional(),
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"]).optional(),
  minLoanRupees: z.number().finite().nonnegative().max(100_000_000).optional(),
  maxLoanRupees: z.number().finite().nonnegative().max(100_000_000).optional(),
}).refine((f) => f.minLoanRupees === undefined || f.maxLoanRupees === undefined || f.minLoanRupees <= f.maxLoanRupees, {
  message: "Minimum loan cannot exceed maximum loan",
  path: ["minLoanRupees"],
});

export interface ToolContext {
  sessionId: string;
  explicitConfirmation?: boolean;
  pendingApplication?: Record<string, unknown>;
}

export const AGENT_TOOL_DESCRIPTIONS = [
  { name: "get_loan_schemes", description: "List active gold loan plans. Only describe plans returned by this tool.", parameters: { type: "object", properties: {}, required: [] } },
  { name: "calculate_quote", description: "Calculate a gold loan quote. Never do arithmetic yourself.", parameters: { type: "object", properties: { grossWeightGrams: { type: "number" }, netWeightGrams: { type: "number" }, karat: { type: "integer", enum: [18, 22, 24] }, planId: { type: "string" } }, required: ["grossWeightGrams", "netWeightGrams", "karat"] } },
  { name: "check_existing_application", description: "Check whether a mobile number has an application from the last 7 days.", parameters: { type: "object", properties: { mobileNumber: { type: "string" } }, required: ["mobileNumber"] } },
  { name: "submit_application", description: "Prepare or submit an application. Submission requires userConfirmed=true and session confirmation.", parameters: { type: "object", properties: { fullName: { type: "string" }, mobileNumber: { type: "string" }, grossWeightGrams: { type: "number" }, netWeightGrams: { type: "number" }, karat: { type: "integer", enum: [18, 22, 24] }, planId: { type: "string" }, userConfirmed: { type: "boolean" } }, required: ["fullName", "mobileNumber", "grossWeightGrams", "netWeightGrams", "karat", "planId", "userConfirmed"] } },
] as const;

export type AgentToolName = typeof AGENT_TOOL_DESCRIPTIONS[number]["name"] | "filter_leads_safe";

export async function executeAgentTool(name: string, rawArgs: unknown, context: ToolContext) {
  try {
    switch (name) {
      case "get_loan_schemes":
        return { success: true, data: await listActiveSchemes() };
      case "calculate_quote": {
        const parsed = quoteInputSchema.safeParse(rawArgs);
        if (!parsed.success) throw validationError(zodToFieldErrors(parsed.error));
        return { success: true, data: await calculateQuote(parsed.data) };
      }
      case "check_existing_application": {
        const parsed = checkApplicationSchema.safeParse(rawArgs);
        if (!parsed.success) throw validationError(zodToFieldErrors(parsed.error));
        return { success: true, data: await checkExistingApplication(parsed.data.mobileNumber) };
      }
      case "submit_application": {
        const parsed = submitApplicationSchema.safeParse(rawArgs);
        if (!parsed.success) throw validationError(zodToFieldErrors(parsed.error));
        const { userConfirmed, ...application } = parsed.data;
        const existing = await checkExistingApplication(application.mobileNumber);
        if (existing.exists) {
          return {
            success: false,
            error: {
              code: "DUPLICATE_APPLICATION",
              statusCode: 409,
              message: `409 Conflict: application ${existing.applicationId} was already submitted${existing.appliedAt ? ` on ${existing.appliedAt}` : ""}.`,
              applicationId: existing.applicationId,
              appliedAt: existing.appliedAt,
            },
          };
        }
        if (context.pendingApplication && !sameApplication(context.pendingApplication, application)) {
          throw new AppError("VALIDATION_ERROR", "The application details changed. Please review the updated summary and confirm again.", {
            fields: [{ field: "userConfirmed", message: "Confirmation is required for the current application details." }],
          });
        }
        if (userConfirmed !== true || context.explicitConfirmation !== true || !context.pendingApplication) {
          const quotes = await calculateQuote(application);
          const quote = quotes[0];
          if (!quote) throw new AppError("NOT_FOUND", "No active loan plan is available.");
          return {
            success: true,
            data: {
              status: "CONFIRMATION_REQUIRED",
              summary: {
                ...application,
                planName: quote.planName,
                pureGoldGrams: quote.pureGoldGrams,
                goldValue: quote.goldValue,
                eligibleLoan: quote.eligibleLoan,
              },
            },
          };
        }
        const lead = await submitLead(application, "AI_AGENT");
        return { success: true, data: { status: "SUBMITTED", applicationId: lead.applicationId, leadStatus: lead.status } };
      }
      case "filter_leads_safe": {
        const parsed = safeLeadFilterSchema.safeParse(rawArgs);
        if (!parsed.success) throw validationError(zodToFieldErrors(parsed.error));
        return { success: true, data: await filterLeadsSafe(parsed.data as SafeLeadFilter) };
      }
      default:
        throw new AppError("VALIDATION_ERROR", `Unknown tool: "${name}".`, { fields: [{ field: "tool", message: "This tool is not available." }] });
    }
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.toResponse().error };
    if (error instanceof z.ZodError) return { success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed.", fields: zodToFieldErrors(error) } };
    throw error;
  }
}

function sameApplication(pending: Record<string, unknown>, current: Record<string, unknown>) {
  const keys = ["fullName", "mobileNumber", "grossWeightGrams", "netWeightGrams", "karat", "planId"] as const;
  return keys.every((key) => pending[key] === current[key]);
}

export function maskMobileNumber(mobile: string) {
  return mobile.length === 10 ? `${mobile.slice(0, 4)}XXXX${mobile.slice(8)}` : "[masked]";
}
