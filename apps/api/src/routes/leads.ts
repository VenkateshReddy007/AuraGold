/**
 * apps/api/src/routes/leads.ts
 * REST endpoints for Gold Loan Leads.
 *
 * POST /api/v1/leads          – submit a new lead
 * GET  /api/v1/leads          – list all leads (admin)
 * GET  /api/v1/leads/:id      – fetch single lead by applicationId or UUID
 * PATCH /api/v1/leads/:id/status – update lead status (admin)
 */

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createLeadSchema, updateLeadStatusSchema } from "../schemas/lead.js";
import { appraise } from "../lib/gold.js";
import { generateApplicationId } from "../lib/applicationId.js";

export const leadsRouter = Router();

// POST /api/v1/leads
leadsRouter.post("/", async (req, res) => {
  const body = createLeadSchema.parse(req.body);

  // Idempotency: if key provided and already exists, return cached response
  if (body.idempotencyKey) {
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { key: body.idempotencyKey },
    });
    if (existing) {
      return res.status(existing.statusCode).json(existing.responseBody);
    }
  }

  // 7-day duplicate mobile check
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentDuplicate = await prisma.lead.findFirst({
    where: {
      mobileNumber: body.mobileNumber,
      createdAt: { gte: sevenDaysAgo },
    },
  });
  if (recentDuplicate) {
    return res.status(409).json({
      success: false,
      error: "A lead with this mobile number was submitted within the last 7 days.",
      existingApplicationId: recentDuplicate.applicationId,
    });
  }

  // Verify plan exists and is active
  const plan = await prisma.loanScheme.findFirst({
    where: { id: body.planId, isActive: true },
  });
  if (!plan) {
    return res.status(422).json({ success: false, error: "Plan not found or inactive." });
  }

  // Gold appraisal calculations
  const appraisal = appraise({
    grossWeightGrams: body.grossWeightGrams,
    netWeightGrams: body.netWeightGrams,
    karat: body.karat,
    maxLtvPercent: Number(plan.maxLtvPercent),
  });

  const applicationId = await generateApplicationId();

  const lead = await prisma.lead.create({
    data: {
      applicationId,
      fullName: body.fullName,
      mobileNumber: body.mobileNumber,
      grossWeightGrams: body.grossWeightGrams,
      netWeightGrams: body.netWeightGrams,
      karat: body.karat,
      pureGoldGrams: appraisal.pureGoldGrams,
      rate24kPaise: appraisal.rate24kPaise,
      goldValuePaise: appraisal.goldValuePaise,
      eligibleLoanPaise: appraisal.eligibleLoanPaise,
      planId: body.planId,
      source: body.source ?? "WEB_FORM",
      idempotencyKey: body.idempotencyKey,
    },
    include: { plan: true },
  });

  // Create initial audit log
  await prisma.auditLog.create({
    data: {
      leadId: lead.id,
      fromStatus: null,
      toStatus: "SUBMITTED",
      actor: lead.source === "AI_AGENT" ? "AI_AGENT" : "SYSTEM",
      note: `Application submitted via ${lead.source === "AI_AGENT" ? "AI agent" : "web form"}`,
    },
  });

  const responseBody = {
    success: true,
    data: serialiseLead(lead),
  };

  // Store idempotency record
  if (body.idempotencyKey) {
    await prisma.idempotencyRecord.create({
      data: {
        key: body.idempotencyKey,
        requestHash: "",
        statusCode: 201,
        responseBody,
      },
    });
  }

  return res.status(201).json(responseBody);
});

// GET /api/v1/leads
leadsRouter.get("/", async (_req, res) => {
  const leads = await prisma.lead.findMany({
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ success: true, data: leads.map(serialiseLead) });
});

// GET /api/v1/leads/:id
leadsRouter.get("/:id", async (req, res) => {
  const { id } = req.params;
  const lead = await prisma.lead.findFirst({
    where: { OR: [{ id }, { applicationId: id }] },
    include: { plan: true, auditLogs: { orderBy: { createdAt: "asc" } } },
  });
  if (!lead) {
    return res.status(404).json({ success: false, error: "Lead not found." });
  }
  return res.json({ success: true, data: serialiseLead(lead) });
});

// PATCH /api/v1/leads/:id/status
leadsRouter.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const body = updateLeadStatusSchema.parse(req.body);

  const lead = await prisma.lead.findFirst({
    where: { OR: [{ id }, { applicationId: id }] },
  });
  if (!lead) {
    return res.status(404).json({ success: false, error: "Lead not found." });
  }

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: { status: body.status },
    include: { plan: true },
  });

  await prisma.auditLog.create({
    data: {
      leadId: lead.id,
      fromStatus: lead.status,
      toStatus: body.status,
      actor: body.actor ?? "ADMIN",
      note: body.note ?? `Status changed to ${body.status}`,
    },
  });

  return res.json({ success: true, data: serialiseLead(updated) });
});

// ---------------------------------------------------------------------------
// Serialiser – converts BigInt fields to strings for JSON transport
// ---------------------------------------------------------------------------

function serialiseLead(lead: Record<string, unknown>): unknown {
  return JSON.parse(
    JSON.stringify(lead, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}
