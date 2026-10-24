/**
 * tests/api.test.ts
 *
 * Supertest integration tests covering Pages 3, 4, and 8 of the brief.
 *
 * Requires a live PostgreSQL database (DATABASE_URL env var).
 * All helpers are inlined to avoid cross-file import resolution issues
 * in Vitest's vmThreads pool.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createServer } from "node:http";
import supertest from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
// Inline infrastructure — app server, prisma, helpers
// ─────────────────────────────────────────────────────────────────────────────

const app   = createApp();
const server = createServer(app);
const agent  = supertest.agent(server);
const prisma = new PrismaClient({ log: [] });

/** Close server + disconnect Prisma after entire file finishes. */
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

/** Returns a fresh unique Indian mobile number per call. */
let _mobileSeq = 200;
function uniqueMobile() {
  return `9${String(_mobileSeq++).padStart(9, "0")}`;
}

/** Masked form the API returns: first-4 + XXXX + last-2 */
function maskMobile(m: string) {
  return `${m.slice(0, 4)}XXXX${m.slice(8)}`;
}

/** Wipe all transient rows, keep reference data (LoanScheme). */
async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.lead.deleteMany();
}

/** Upsert the two required loan schemes. */
async function ensurePlans() {
  await prisma.loanScheme.upsert({
    where: { id: "PLAN_BULLET_01" },
    create: { id: "PLAN_BULLET_01", name: "Bullet Repayment", interestRatePa: 12.0, maxLtvPercent: 70.0, tenureMonths: 12, description: "12 months, interest + principal at maturity", isActive: true },
    update: {},
  });
  await prisma.loanScheme.upsert({
    where: { id: "PLAN_EMI_01" },
    create: { id: "PLAN_EMI_01", name: "Monthly EMI", interestRatePa: 10.5, maxLtvPercent: 75.0, tenureMonths: 12, description: "12 months, equal monthly instalments", isActive: true },
    update: {},
  });
}

/** Build a valid lead POST body. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Ramesh Kumar",
    mobileNumber: uniqueMobile(),
    grossWeightGrams: 50,
    netWeightGrams: 45,
    karat: 22,
    planId: "PLAN_EMI_01",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/loan-schemes
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/v1/loan-schemes", () => {
  beforeAll(async () => { await ensurePlans(); });

  it("200 with exactly 2 active schemes", async () => {
    const res = await agent.get("/api/v1/loan-schemes");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  it("every scheme has maxLtvPercent <= 75", async () => {
    const res = await agent.get("/api/v1/loan-schemes");
    for (const s of res.body.data as Array<{ maxLtvPercent: string }>) {
      expect(Number(s.maxLtvPercent)).toBeLessThanOrEqual(75);
    }
  });

  it("contains PLAN_BULLET_01 and PLAN_EMI_01", async () => {
    const res = await agent.get("/api/v1/loan-schemes");
    const ids = (res.body.data as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain("PLAN_BULLET_01");
    expect(ids).toContain("PLAN_EMI_01");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/quotes  (stateless — no DB write)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/quotes", () => {
  beforeAll(async () => { await ensurePlans(); });

  it("Case #1: 45g 22K PLAN_EMI_01 → pureGold=41.25, goldValue=288750, eligibleLoan=216562", async () => {
    const res = await agent.post("/api/v1/quotes").send({
      grossWeightGrams: 50, netWeightGrams: 45, karat: 22, planId: "PLAN_EMI_01",
    });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.pureGoldGrams).toBe("41.2500");
    expect(d.goldValue).toBe(288_750);
    expect(d.goldValueRupees).toBe(288_750);
    expect(d.eligibleLoan).toBe(216_562);
    expect(d.eligibleLoanPaise).toBe("21656200");
  });

  it("Case #2: 45g 22K PLAN_BULLET_01 → eligibleLoan=202125", async () => {
    const res = await agent.post("/api/v1/quotes").send({
      grossWeightGrams: 50, netWeightGrams: 45, karat: 22, planId: "PLAN_BULLET_01",
    });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.pureGoldGrams).toBe("41.2500");
    expect(d.goldValue).toBe(288_750);
    expect(d.goldValueRupees).toBe(288_750);
    expect(d.eligibleLoan).toBe(202_125);
  });

  it("Case #3: 10g 18K PLAN_EMI_01 → pureGold=7.5, goldValue=52500, eligibleLoan=39375", async () => {
    const res = await agent.post("/api/v1/quotes").send({
      grossWeightGrams: 12, netWeightGrams: 10, karat: 18, planId: "PLAN_EMI_01",
    });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.pureGoldGrams).toBe("7.5000");
    expect(d.goldValue).toBe(52_500);
    expect(d.goldValueRupees).toBe(52_500);
    expect(d.eligibleLoan).toBe(39_375);
  });

  it("does NOT write a lead to the database", async () => {
    const before = await prisma.lead.count();
    await agent.post("/api/v1/quotes").send({
      grossWeightGrams: 50, netWeightGrams: 45, karat: 22, planId: "PLAN_EMI_01",
    });
    expect(await prisma.lead.count()).toBe(before);
  });

  it("400 when netWeightGrams > grossWeightGrams — field netWeightGrams", async () => {
    const res = await agent.post("/api/v1/quotes").send({
      grossWeightGrams: 40, netWeightGrams: 45, karat: 22, planId: "PLAN_EMI_01",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields: Array<{ field: string }> = res.body.error.fields;
    expect(fields.some((f) => f.field === "netWeightGrams")).toBe(true);
  });

  it("404 for unknown planId", async () => {
    const res = await agent.post("/api/v1/quotes").send({
      grossWeightGrams: 50, netWeightGrams: 45, karat: 22, planId: "PLAN_FAKE_99",
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/leads — Happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/leads — happy path", () => {
  beforeAll(async () => { await ensurePlans(); });
  beforeEach(async () => { await resetDb(); });

  it("201 with applicationId matching GL-\\d+", async () => {
    const res = await agent.post("/api/v1/leads").send(payload());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.applicationId).toMatch(/^GL-\d+$/);
  });

  it("45g 22K PLAN_EMI_01 → eligibleLoanPaise='21656200' (₹216,562)", async () => {
    const res = await agent.post("/api/v1/leads").send(
      payload({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22, planId: "PLAN_EMI_01" })
    );
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.eligibleLoanPaise).toBe("21656200");
    expect(Math.floor(Number(d.eligibleLoanPaise) / 100)).toBe(216_562);
  });

  it("server ignores tampered client loan figures, recomputes correctly", async () => {
    const res = await agent.post("/api/v1/leads").send({
      ...payload({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22, planId: "PLAN_EMI_01" }),
      eligibleLoanPaise: "999999999",
      goldValuePaise:    "999999999",
      pureGoldGrams:     "99.9999",
      rate24kPaise:      "1",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.eligibleLoanPaise).toBe("21656200");
    // pureGoldGrams stored as Decimal — may lose trailing zeros in serialisation
    expect(Number(res.body.data.pureGoldGrams)).toBeCloseTo(41.25, 4);
  });

  it("response status is SUBMITTED", async () => {
    const res = await agent.post("/api/v1/leads").send(payload());
    expect(res.body.data.status).toBe("SUBMITTED");
  });

  it("creates one AuditLog entry (toStatus=SUBMITTED, fromStatus=null)", async () => {
    const res = await agent.post("/api/v1/leads").send(payload());
    const logs = await prisma.auditLog.findMany({ where: { leadId: res.body.data.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.toStatus).toBe("SUBMITTED");
    expect(logs[0]!.fromStatus).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/leads — Validation errors
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/leads — validation errors", () => {
  it("Case #4: netWeightGrams=52 grossWeightGrams=50 → 400, field netWeightGrams", async () => {
    const res = await agent.post("/api/v1/leads").send(
      payload({ grossWeightGrams: 50, netWeightGrams: 52 })
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields: Array<{ field: string; message: string }> = res.body.error.fields;
    const f = fields.find((x) => x.field === "netWeightGrams");
    expect(f).toBeDefined();
    expect(f?.message).toBe("Net weight cannot exceed gross weight");
  });

  it("Case #5a: mobileNumber '5876543210' → 400, field mobileNumber", async () => {
    const res = await agent.post("/api/v1/leads").send(
      payload({ mobileNumber: "5876543210" })
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields: Array<{ field: string }> = res.body.error.fields;
    expect(fields.some((f) => f.field === "mobileNumber")).toBe(true);
  });

  it("Case #5b: mobileNumber '98765' → 400, field mobileNumber", async () => {
    const res = await agent.post("/api/v1/leads").send(
      payload({ mobileNumber: "98765" })
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields: Array<{ field: string }> = res.body.error.fields;
    expect(fields.some((f) => f.field === "mobileNumber")).toBe(true);
  });

  it("fullName with digits → 400, field fullName", async () => {
    const res = await agent.post("/api/v1/leads").send(payload({ fullName: "John123" }));
    expect(res.status).toBe(400);
    const fields: Array<{ field: string }> = res.body.error.fields;
    expect(fields.some((f) => f.field === "fullName")).toBe(true);
  });

  it("karat=21 → 400, field karat", async () => {
    const res = await agent.post("/api/v1/leads").send(payload({ karat: 21 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields: Array<{ field: string }> = res.body.error.fields;
    expect(fields.some((f) => f.field === "karat")).toBe(true);
  });

  it("planId='PLAN_FAKE_99' → 404 with standard error shape", async () => {
    const res = await agent.post("/api/v1/leads").send(payload({ planId: "PLAN_FAKE_99" }));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error).toHaveProperty("message");
    expect(res.body).not.toHaveProperty("success");
  });

  it("error shape is always { error: { code, message } } — never { success:false }", async () => {
    const res = await agent.post("/api/v1/leads").send(payload({ mobileNumber: "1234567890" }));
    expect(res.body).toHaveProperty("error.code");
    expect(res.body).toHaveProperty("error.message");
    expect(res.body).not.toHaveProperty("success");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case #6 — 7-day duplicate mobile → 409
// ─────────────────────────────────────────────────────────────────────────────

describe("Case #6 — 7-day duplicate mobile", () => {
  beforeAll(async () => { await ensurePlans(); });
  beforeEach(async () => { await resetDb(); });

  it("409 DUPLICATE_APPLICATION with existingAppId and appliedAt", async () => {
    const mobile = uniqueMobile();
    const first = await agent.post("/api/v1/leads").send(payload({ mobileNumber: mobile }));
    expect(first.status).toBe(201);
    const existingAppId = first.body.data.applicationId;

    const second = await agent.post("/api/v1/leads").send(payload({ mobileNumber: mobile }));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("DUPLICATE_APPLICATION");
    expect(second.body.error.applicationId).toBe(existingAppId);
    expect(second.body.error.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case #7 (Bonus B1) — Idempotency-Key replay
// ─────────────────────────────────────────────────────────────────────────────

describe("Case #7 (Bonus B1) — Idempotency-Key replay", () => {
  beforeAll(async () => { await ensurePlans(); });
  beforeEach(async () => { await resetDb(); });

  it("same key replays 201 with identical applicationId", async () => {
    const ikey = crypto.randomUUID();
    const p = payload();
    const first  = await agent.post("/api/v1/leads").set("Idempotency-Key", ikey).send(p);
    expect(first.status).toBe(201);
    const second = await agent.post("/api/v1/leads").set("Idempotency-Key", ikey).send(p);
    expect(second.status).toBe(201);
    expect(second.body.data.applicationId).toBe(first.body.data.applicationId);
  });

  it("replayed response has X-Idempotency-Replayed: true", async () => {
    const ikey = crypto.randomUUID();
    const p = payload();
    await agent.post("/api/v1/leads").set("Idempotency-Key", ikey).send(p);
    const second = await agent.post("/api/v1/leads").set("Idempotency-Key", ikey).send(p);
    expect(second.headers["x-idempotency-replayed"]).toBe("true");
  });

  it("3 replays create only ONE lead in DB", async () => {
    const ikey = crypto.randomUUID();
    const p = payload();
    for (let i = 0; i < 3; i++) {
      await agent.post("/api/v1/leads").set("Idempotency-Key", ikey).send(p);
    }
    expect(await prisma.lead.count()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case #8 (Bonus B1) — Concurrent duplicate (Promise.all race)
// ─────────────────────────────────────────────────────────────────────────────

describe("Case #8 (Bonus B1) — Concurrent duplicate (no idempotency key)", () => {
  beforeAll(async () => { await ensurePlans(); });
  beforeEach(async () => { await resetDb(); });

  it("Promise.all with same mobile → exactly [201, 409]", async () => {
    const mobile = uniqueMobile();
    const p = payload({ mobileNumber: mobile });
    // Use separate supertest instances to force parallel HTTP connections
    const [r1, r2] = await Promise.all([
      supertest(app).post("/api/v1/leads").send({ ...p }),
      supertest(app).post("/api/v1/leads").send({ ...p }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
  });

  it("race leaves exactly one lead row in DB", async () => {
    const mobile = uniqueMobile();
    const p = payload({ mobileNumber: mobile });
    await Promise.all([
      supertest(app).post("/api/v1/leads").send({ ...p }),
      supertest(app).post("/api/v1/leads").send({ ...p }),
    ]);
    expect(await prisma.lead.count({ where: { mobileNumber: mobile } })).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/leads — mobile masking + sort order
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/v1/leads — mobile masking and sort order", () => {
  beforeAll(async () => { await ensurePlans(); });
  beforeEach(async () => { await resetDb(); });

  it("masks mobileNumber as first-4 + XXXX + last-2 (e.g. '9876XXXX10')", async () => {
    const mobile = "9876543210";
    await agent.post("/api/v1/leads").send(payload({ mobileNumber: mobile }));
    const res = await agent.get("/api/v1/leads");
    expect(res.status).toBe(200);
    const lead = res.body.data[0];
    expect(lead.mobileNumber).toBe("9876XXXX10");
    expect(lead.mobileNumber).not.toContain("543");
  });

  it("maskMobile() helper matches the API's masking format", async () => {
    const mobile = uniqueMobile();
    await agent.post("/api/v1/leads").send(payload({ mobileNumber: mobile }));
    const res = await agent.get("/api/v1/leads");
    expect(res.body.data[0].mobileNumber).toBe(maskMobile(mobile));
  });

  it("leads sorted newest first", async () => {
    for (let i = 0; i < 3; i++) {
      await agent.post("/api/v1/leads").send(payload());
      await new Promise((r) => setTimeout(r, 60));
    }
    const res = await agent.get("/api/v1/leads");
    const dates = (res.body.data as Array<{ createdAt: string }>)
      .map((l) => new Date(l.createdAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]!).toBeGreaterThanOrEqual(dates[i]!);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bonus B1 — Status Workflow + AuditLog
// ─────────────────────────────────────────────────────────────────────────────

describe("Bonus B1 — Status workflow + AuditLog", () => {
  beforeAll(async () => { await ensurePlans(); });
  beforeEach(async () => { await resetDb(); });

  async function submitLead() {
    const res = await agent.post("/api/v1/leads").send(payload());
    expect(res.status).toBe(201);
    return res.body.data as { id: string; applicationId: string };
  }

  const transition = (appId: string, status: string, actor = "ADMIN") =>
    agent.patch(`/api/v1/leads/${appId}/status`).send({ status, actor });

  it("SUBMITTED → UNDER_REVIEW → APPROVED, AuditLog has 3 entries", async () => {
    const lead = await submitLead();
    expect((await transition(lead.applicationId, "UNDER_REVIEW")).status).toBe(200);
    expect((await transition(lead.applicationId, "APPROVED")).status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs).toHaveLength(3);
    expect(logs[0]!.toStatus).toBe("SUBMITTED");
    expect(logs[0]!.fromStatus).toBeNull();
    expect(logs[1]!.fromStatus).toBe("SUBMITTED");
    expect(logs[1]!.toStatus).toBe("UNDER_REVIEW");
    expect(logs[2]!.fromStatus).toBe("UNDER_REVIEW");
    expect(logs[2]!.toStatus).toBe("APPROVED");
  });

  it("APPROVED → SUBMITTED (backward) → 400 VALIDATION_ERROR", async () => {
    const lead = await submitLead();
    await transition(lead.applicationId, "UNDER_REVIEW");
    await transition(lead.applicationId, "APPROVED");
    const bad = await transition(lead.applicationId, "SUBMITTED");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("SUBMITTED → APPROVED (skipping UNDER_REVIEW) → 400/409", async () => {
    const lead = await submitLead();
    const bad = await transition(lead.applicationId, "APPROVED");
    expect(bad.status).toBe(400);
  });

  it("SUBMITTED → REJECTED is allowed", async () => {
    const lead = await submitLead();
    const res = await transition(lead.applicationId, "REJECTED");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REJECTED");
  });

  it("AuditLog records the actor correctly", async () => {
    const lead = await submitLead();
    await transition(lead.applicationId, "UNDER_REVIEW", "BRANCH_MANAGER");
    const logs = await prisma.auditLog.findMany({
      where: { leadId: lead.id, toStatus: "UNDER_REVIEW" },
    });
    expect(logs[0]!.actor).toBe("BRANCH_MANAGER");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/leads/:id
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/v1/leads/:id", () => {
  beforeAll(async () => { await ensurePlans(); });
  beforeEach(async () => { await resetDb(); });

  it("fetches by applicationId, includes auditLogs array", async () => {
    const post = await agent.post("/api/v1/leads").send(payload());
    const appId = post.body.data.applicationId;
    const get = await agent.get(`/api/v1/leads/${appId}`);
    expect(get.status).toBe(200);
    expect(get.body.data.applicationId).toBe(appId);
    expect(Array.isArray(get.body.data.auditLogs)).toBe(true);
    expect(get.body.data.auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("404 for unknown applicationId", async () => {
    const res = await agent.get("/api/v1/leads/GL-9999999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
