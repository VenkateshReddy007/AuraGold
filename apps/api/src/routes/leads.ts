/**
 * apps/api/src/routes/leads.ts
 *
 * REST endpoints for Gold Loan Leads.
 * Uses explicit next(error) — never throw — for vmThreads compatibility.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
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
} from "../middleware/error.middleware.js";
import { submitLead } from "../services/lead.service.js";
import { idempotencyMiddleware, storeIdempotencyResponse } from "../middleware/idempotency.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";

export const leadsRouter = Router();

// ── POST /api/v1/leads ────────────────────────────────────────────────────────

leadsRouter.post("/", rateLimit({ scope: "lead-submit", max: Number(process.env["LEADS_RATE_LIMIT_MAX"] ?? 10) }), idempotencyMiddleware(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createLeadSchema.parse({
      ...(typeof req.body === "object" && req.body !== null ? req.body : {}),
      idempotencyKey: req.headers["idempotency-key"] ?? (req.body as Record<string, unknown>)?.idempotencyKey,
    });
    const lead = await submitLead(input, input.source);

    const responseBody = { success: true, data: serialise(lead) };
    await storeIdempotencyResponse(req, 201, responseBody);
    return res.status(201).json(responseBody);
  } catch (err) {
    if (err instanceof AppError) return next(err);
    // P2002 on mobileNumber = concurrent duplicate (race condition)
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      // Re-fetch the winning lead to return its applicationId
      const existing = await prisma.lead.findFirst({
        where: { mobileNumber: (req.body as { mobileNumber?: string }).mobileNumber ?? "" },
        orderBy: { createdAt: "desc" },
        select: { applicationId: true, createdAt: true },
      }).catch(() => null);
      if (existing) {
        return next(duplicateApplication(existing.applicationId, existing.createdAt));
      }
    }
    return next(err);
  }
});

// ── GET /api/v1/leads ─────────────────────────────────────────────────────────

leadsRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const leads = await prisma.lead.findMany({
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: leads.map(serialise) });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/v1/leads/:id ─────────────────────────────────────────────────────

leadsRouter.get("/:id/audit-logs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const lead = await prisma.lead.findFirst({ where: { OR: [{ id }, { applicationId: id }] }, select: { id: true } });
    if (!lead) return next(notFound("Lead", id));
    const auditLogs = await prisma.auditLog.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
    return res.json({ success: true, data: auditLogs });
  } catch (err) { return next(err); }
});

leadsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const lead = await prisma.lead.findFirst({
      where: { OR: [{ id }, { applicationId: id }] },
      include: { plan: true, auditLogs: { orderBy: { createdAt: "asc" } } },
    });
    if (!lead) return next(notFound("Lead", id));
    return res.json({ success: true, data: serialise(lead) });
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /api/v1/leads/:id/status ───────────────────────────────────────────

leadsRouter.patch("/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };

    const parsed = updateLeadStatusSchema.safeParse(req.body);
    if (!parsed.success) return next(validationError(zodToFieldErrors(parsed.error)));
    const { status, actor, note } = parsed.data;

    const lead = await prisma.lead.findFirst({
      where: { OR: [{ id }, { applicationId: id }] },
    });
    if (!lead) return next(notFound("Lead", id));

    const allowed = VALID_TRANSITIONS[lead.status] ?? [];
    if (!allowed.includes(status)) {
      return next(validationError([{
        field: "status",
        message: `Cannot transition from ${lead.status} to ${status}. Allowed: [${
          allowed.join(", ") || "none — terminal state"
        }].`,
      }]));
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
  } catch (err) {
    return next(err);
  }
});

// ── Serialiser ────────────────────────────────────────────────────────────────

function serialise(obj: unknown): unknown {
  const result = JSON.parse(
    JSON.stringify(obj, (key, value) => {
      if (typeof value === "bigint") return value.toString();
      if (key === "mobileNumber" && typeof value === "string" && value.length === 10) {
        return `${value.slice(0, 4)}XXXX${value.slice(8)}`;
      }
      return value;
    })
  ) as Record<string, unknown>;
  if (typeof result.goldValuePaise === "string") {
    result.goldValue = Number(BigInt(result.goldValuePaise) / 100n);
  }
  if (typeof result.eligibleLoanPaise === "string") {
    result.eligibleLoan = Number(BigInt(result.eligibleLoanPaise) / 100n);
  }
  return result;
}
