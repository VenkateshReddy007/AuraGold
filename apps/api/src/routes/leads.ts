/**
 * apps/api/src/routes/leads.ts
 *
 * REST endpoints for Gold Loan Leads.
 *
 * POST   /api/v1/leads           – submit a new lead
 * GET    /api/v1/leads           – list all leads (admin)
 * GET    /api/v1/leads/:id       – fetch by applicationId or UUID
 * PATCH  /api/v1/leads/:id/status – status transition (admin)
 *
 * Uses:
 *   - math.service.ts for exact integer-paise calculations
 *   - validation.ts for shared Zod schemas (same as AI agent tools)
 *   - error.middleware.ts for the strict error contract
 *   - idempotency.middleware.ts for Idempotency-Key support (Bonus B1)
 */

import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  createLeadSchema,
  updateLeadStatusSchema,
  VALID_TRANSITIONS,
} from "../schemas/validation.js";
import {
  AppError,
  zodToFieldErrors,
  validationError,
  notFound,
  duplicateApplication,
  conflictError,
} from "../middleware/error.middleware.js";
import { calculateAppraisal, getRateFromEnv } from "../services/math.service.js";
import { generateApplicationId } from "../lib/applicationId.js";
import { idempotencyMiddleware } from "../middleware/idempotency.middleware.js";

export const leadsRouter = Router();

// Apply idempotency middleware to POST (lead submission)
leadsRouter.post("/", idempotencyMiddleware(), async (req: Request, res: Response) => {
  // ── 1. Validate input ──────────────────────────────────────────────────────
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(zodToFieldErrors(parsed.error));
  }
  const body = parsed.data;

  // ── 2. 7-day duplicate mobile check ───────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
  const recent = await prisma.lead.findFirst({
    where: {
      mobileNumber: body.mobileNumber,
      createdAt: { gte: sevenDaysAgo },
    },
    select: { applicationId: true, createdAt: true },
  });
  if (recent) {
    throw duplicateApplication(recent.applicationId, recent.createdAt);
  }

  // ── 3. Resolve and validate plan ──────────────────────────────────────────
  const plan = await prisma.loanScheme.findFirst({
    where: { id: body.planId, isActive: true },
  });
  if (!plan) {
    throw new AppError("NOT_FOUND", `Loan plan "${body.planId}" not found or inactive.`);
  }

  // ── 4. Gold appraisal — exact integer paise arithmetic ────────────────────
  const rate = getRateFromEnv();
  const appraisal = calculateAppraisal({
    netWeightGrams: body.netWeightGrams,
    karat: body.karat,
    maxLtvPercent: Number(plan.maxLtvPercent),
    rate24kPerGram: rate,
  });

  // ── 5. Generate human-friendly ID ─────────────────────────────────────────
  const applicationId = await generateApplicationId();

  // ── 6. Persist lead + initial audit log in a transaction ──────────────────
  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        applicationId,
        fullName: body.fullName.trim(),
        mobileNumber: body.mobileNumber,
        grossWeightGrams: body.grossWeightGrams,
        netWeightGrams: body.netWeightGrams,
        karat: body.karat,
        pureGoldGrams: appraisal.pureGoldGrams,
        rate24kPaise: appraisal.rate24kPaise,
        goldValuePaise: appraisal.goldValuePaise,
        eligibleLoanPaise: appraisal.eligibleLoanPaise,
        planId: body.planId,
        source: body.source,
        idempotencyKey:
          (req.headers["idempotency-key"] as string | undefined) ??
          body.idempotencyKey,
      },
      include: { plan: true },
    });

    await tx.auditLog.create({
      data: {
        leadId: created.id,
        fromStatus: null,
        toStatus: "SUBMITTED",
        actor: created.source === "AI_AGENT" ? "AI_AGENT" : "SYSTEM",
        note: `Application submitted via ${
          created.source === "AI_AGENT" ? "AI agent" : "web form"
        }`,
      },
    });

    return created;
  });

  return res.status(201).json({ success: true, data: serialise(lead) });
});

// ── GET /api/v1/leads ─────────────────────────────────────────────────────────

leadsRouter.get("/", async (_req: Request, res: Response) => {
  const leads = await prisma.lead.findMany({
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ success: true, data: leads.map(serialise) });
});

// ── GET /api/v1/leads/:id ─────────────────────────────────────────────────────

leadsRouter.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const lead = await prisma.lead.findFirst({
    where: { OR: [{ id }, { applicationId: id }] },
    include: {
      plan: true,
      auditLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!lead) throw notFound("Lead", id);
  return res.json({ success: true, data: serialise(lead) });
});

// ── PATCH /api/v1/leads/:id/status ───────────────────────────────────────────

leadsRouter.patch("/:id/status", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const parsed = updateLeadStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(zodToFieldErrors(parsed.error));
  }
  const { status, actor, note } = parsed.data;

  const lead = await prisma.lead.findFirst({
    where: { OR: [{ id }, { applicationId: id }] },
  });
  if (!lead) throw notFound("Lead", id);

  // Enforce status workflow
  const allowed = VALID_TRANSITIONS[lead.status] ?? [];
  if (!allowed.includes(status)) {
    throw conflictError(
      `Cannot transition from ${lead.status} to ${status}. Allowed: [${
        allowed.join(", ") || "none — terminal state"
      }].`
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.lead.update({
      where: { id: lead.id },
      data: { status },
      include: { plan: true },
    });
    await tx.auditLog.create({
      data: {
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: status,
        actor: actor ?? "ADMIN",
        note: note ?? `Status changed from ${lead.status} to ${status}`,
      },
    });
    return u;
  });

  return res.json({ success: true, data: serialise(updated) });
});

// ── Serialiser ────────────────────────────────────────────────────────────────

/** Convert BigInt fields to strings for JSON transport. */
function serialise(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}
