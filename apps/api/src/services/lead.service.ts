import { prisma } from "../lib/prisma.js";
import {
  createLeadSchema,
  mobileNumberSchema,
  type CreateLeadInput,
} from "../schemas/validation.js";
import {
  AppError,
  duplicateApplication,
  validationError,
  zodToFieldErrors,
} from "../middleware/error.middleware.js";
import { calculateQuote } from "./quote.service.js";
import { generateApplicationId } from "../lib/applicationId.js";

export async function checkExistingApplication(rawMobile: unknown) {
  const parsed = mobileNumberSchema.safeParse(rawMobile);
  if (!parsed.success) throw validationError(zodToFieldErrors(parsed.error));
  const appliedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
  const lead = await prisma.lead.findFirst({
    where: { mobileNumber: parsed.data, createdAt: { gte: appliedAfter } },
    select: { applicationId: true, createdAt: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  return lead
    ? { exists: true as const, applicationId: lead.applicationId, appliedAt: lead.createdAt.toISOString(), status: lead.status }
    : { exists: false as const };
}

export async function submitLead(rawInput: unknown, source: "WEB_FORM" | "AI_AGENT" = "WEB_FORM") {
  const parsed = createLeadSchema.safeParse({ ...asRecord(rawInput), source });
  if (!parsed.success) throw validationError(zodToFieldErrors(parsed.error));
  const body: CreateLeadInput = parsed.data;
  const quote = (await calculateQuote({
    grossWeightGrams: body.grossWeightGrams,
    netWeightGrams: body.netWeightGrams,
    karat: body.karat,
    planId: body.planId,
  }))[0];
  if (!quote) throw new AppError("NOT_FOUND", `Loan plan "${body.planId}" not found or inactive.`);

  return prisma.$transaction(async (tx) => {
    // Serialize check + insert. The lock is held until the lead and audit row commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(17001, 1)`;
    const recent = await tx.lead.findFirst({
      where: {
        mobileNumber: body.mobileNumber,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000) },
      },
      select: { applicationId: true, createdAt: true },
    });
    if (recent) throw duplicateApplication(recent.applicationId, recent.createdAt);

    const applicationId = await generateApplicationId(tx);
    const lead = await tx.lead.create({
      data: {
        applicationId,
        fullName: body.fullName,
        mobileNumber: body.mobileNumber,
        grossWeightGrams: body.grossWeightGrams,
        netWeightGrams: body.netWeightGrams,
        karat: body.karat,
        pureGoldGrams: quote.pureGoldGrams,
        rate24kPaise: BigInt(quote.rate24kPaise),
        goldValuePaise: BigInt(quote.goldValuePaise),
        eligibleLoanPaise: BigInt(quote.eligibleLoanPaise),
        planId: body.planId,
        source,
        idempotencyKey: body.idempotencyKey,
      },
      include: { plan: true },
    });
    await tx.auditLog.create({
      data: {
        leadId: lead.id,
        fromStatus: null,
        toStatus: "SUBMITTED",
        actor: source === "AI_AGENT" ? "AI_AGENT" : "SYSTEM",
        note: `Application submitted via ${source === "AI_AGENT" ? "AI agent" : "web form"}`,
      },
    });
    return lead;
  });
}

export interface SafeLeadFilter {
  planId?: string;
  karat?: 18 | 22 | 24;
  status?: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  minLoanRupees?: number;
  maxLoanRupees?: number;
}

export async function filterLeadsSafe(filter: SafeLeadFilter) {
  return prisma.lead.findMany({
    where: {
      ...(filter.planId ? { planId: filter.planId } : {}),
      ...(filter.karat ? { karat: filter.karat } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.minLoanRupees !== undefined || filter.maxLoanRupees !== undefined
        ? {
          eligibleLoanPaise: {
            ...(filter.minLoanRupees !== undefined ? { gte: BigInt(Math.floor(filter.minLoanRupees)) * 100n } : {}),
            ...(filter.maxLoanRupees !== undefined ? { lte: BigInt(Math.floor(filter.maxLoanRupees)) * 100n } : {}),
          },
        }
        : {}),
    },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}
