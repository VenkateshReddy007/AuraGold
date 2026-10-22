/**
 * apps/api/prisma/seed.ts
 *
 * Seeds:
 *   1. Two mandatory LoanScheme records (PLAN_BULLET_01, PLAN_EMI_01)
 *   2. Three realistic sample leads with AuditLog entries
 *
 * Run via:  npm run db:seed  (from workspace root)
 *            tsx prisma/seed.ts  (directly)
 *
 * All monetary values are stored as integer paise (1 INR = 100 paise).
 */

import { PrismaClient, LeadStatus, LeadSource } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert rupees (number) to paise (BigInt). */
const toPaise = (rupees: number): bigint => BigInt(Math.round(rupees * 100));

/**
 * Calculate eligible loan ceiling.
 * All values in paise; maxLtvPercent is 0-100.
 */
const eligibleLoan = (goldValuePaise: bigint, maxLtvPercent: number): bigint =>
  (goldValuePaise * BigInt(Math.round(maxLtvPercent * 100))) / BigInt(10000);

// ---------------------------------------------------------------------------
// Loan Schemes
// ---------------------------------------------------------------------------

const LOAN_SCHEMES = [
  {
    id: "PLAN_BULLET_01",
    name: "Bullet Repayment",
    interestRatePa: 12.0,
    maxLtvPercent: 70.0,
    tenureMonths: 12,
    description: "12 months, interest + principal at maturity",
    isActive: true,
  },
  {
    id: "PLAN_EMI_01",
    name: "Monthly EMI",
    interestRatePa: 10.5,
    maxLtvPercent: 75.0,
    tenureMonths: 12,
    description: "12 months, equal monthly instalments",
    isActive: true,
  },
] as const;

// ---------------------------------------------------------------------------
// Sample Leads (historical dates — won't collide with test mobile numbers)
// ---------------------------------------------------------------------------

interface SampleLead {
  id: string;
  applicationId: string;
  fullName: string;
  mobileNumber: string;
  grossWeightGrams: number;
  netWeightGrams: number;
  karat: number;
  pureGoldGrams: number;
  rate24kPaise: bigint;
  goldValuePaise: bigint;
  eligibleLoanPaise: bigint;
  planId: string;
  status: LeadStatus;
  source: LeadSource;
  createdAt: Date;
  updatedAt: Date;
  auditNote: string;
  auditActor: string;
}

const RATE_24K_PAISE = BigInt(700_000); // ₹7,000 per gram = 700,000 paise

function makeLead(overrides: {
  id: string;
  applicationId: string;
  fullName: string;
  mobileNumber: string;
  grossWeightGrams: number;
  netWeightGrams: number;
  karat: 18 | 22 | 24;
  planId: string;
  status: LeadStatus;
  source: LeadSource;
  createdAt: Date;
  auditNote: string;
  auditActor: string;
}): SampleLead {
  const pureGoldGrams =
    Math.round((overrides.netWeightGrams * overrides.karat * 10000) / 24) /
    10000;
  const goldValuePaise =
    (BigInt(Math.round(pureGoldGrams * 10_000)) * RATE_24K_PAISE) /
    BigInt(10_000);

  const plan = LOAN_SCHEMES.find((p) => p.id === overrides.planId)!;
  const eligible = eligibleLoan(goldValuePaise, plan.maxLtvPercent);

  return {
    ...overrides,
    pureGoldGrams,
    rate24kPaise: RATE_24K_PAISE,
    goldValuePaise,
    eligibleLoanPaise: eligible,
    updatedAt: overrides.createdAt,
  };
}

const SAMPLE_LEADS: SampleLead[] = [
  makeLead({
    id: "11111111-0000-0000-0000-000000000001",
    applicationId: "GL-1001",
    fullName: "Ananya Krishnamurthy",
    mobileNumber: "9876540001",
    grossWeightGrams: 25.5,
    netWeightGrams: 24.0,
    karat: 22,
    planId: "PLAN_EMI_01",
    status: LeadStatus.APPROVED,
    source: LeadSource.WEB_FORM,
    createdAt: new Date("2026-09-10T09:15:00Z"),
    auditNote: "Application submitted via web form",
    auditActor: "SYSTEM",
  }),
  makeLead({
    id: "11111111-0000-0000-0000-000000000002",
    applicationId: "GL-1002",
    fullName: "Rajesh Venkataraman",
    mobileNumber: "9876540002",
    grossWeightGrams: 40.0,
    netWeightGrams: 38.5,
    karat: 24,
    planId: "PLAN_BULLET_01",
    status: LeadStatus.UNDER_REVIEW,
    source: LeadSource.AI_AGENT,
    createdAt: new Date("2026-09-18T14:30:00Z"),
    auditNote: "Application submitted via AI agent",
    auditActor: "AI_AGENT",
  }),
  makeLead({
    id: "11111111-0000-0000-0000-000000000003",
    applicationId: "GL-1003",
    fullName: "Meera Subramaniam",
    mobileNumber: "9876540003",
    grossWeightGrams: 18.0,
    netWeightGrams: 17.2,
    karat: 18,
    planId: "PLAN_EMI_01",
    status: LeadStatus.SUBMITTED,
    source: LeadSource.WEB_FORM,
    createdAt: new Date("2026-10-01T11:00:00Z"),
    auditNote: "Application submitted via web form",
    auditActor: "SYSTEM",
  }),
];

// ---------------------------------------------------------------------------
// Status-transition audit entries for the APPROVED lead
// ---------------------------------------------------------------------------

const EXTRA_AUDIT_LOGS = [
  {
    id: "22222222-0000-0000-0000-000000000001",
    leadId: "11111111-0000-0000-0000-000000000001",
    fromStatus: "SUBMITTED",
    toStatus: "UNDER_REVIEW",
    actor: "SYSTEM",
    note: "Moved to review queue automatically",
    createdAt: new Date("2026-09-10T09:20:00Z"),
  },
  {
    id: "22222222-0000-0000-0000-000000000002",
    leadId: "11111111-0000-0000-0000-000000000001",
    fromStatus: "UNDER_REVIEW",
    toStatus: "APPROVED",
    actor: "ADMIN",
    note: "Documents verified; loan sanctioned",
    createdAt: new Date("2026-09-11T10:05:00Z"),
  },
  {
    id: "22222222-0000-0000-0000-000000000003",
    leadId: "11111111-0000-0000-0000-000000000002",
    fromStatus: "SUBMITTED",
    toStatus: "UNDER_REVIEW",
    actor: "AI_AGENT",
    note: "Escalated for manual review — high-value application",
    createdAt: new Date("2026-09-18T14:35:00Z"),
  },
];

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱  Seeding database…\n");

  // 1. Loan schemes (upsert — safe to re-run)
  for (const scheme of LOAN_SCHEMES) {
    await prisma.loanScheme.upsert({
      where: { id: scheme.id },
      create: scheme,
      update: {
        name: scheme.name,
        interestRatePa: scheme.interestRatePa,
        maxLtvPercent: scheme.maxLtvPercent,
        tenureMonths: scheme.tenureMonths,
        description: scheme.description,
        isActive: scheme.isActive,
      },
    });
    console.log(`  ✔  LoanScheme  ${scheme.id}  (${scheme.name})`);
  }

  // 2. Sample leads + initial audit log entries
  for (const lead of SAMPLE_LEADS) {
    const { auditNote, auditActor, ...leadData } = lead;

    // Upsert lead by its stable UUID
    await prisma.lead.upsert({
      where: { id: leadData.id },
      create: leadData,
      update: {
        fullName: leadData.fullName,
        status: leadData.status,
        updatedAt: leadData.updatedAt,
      },
    });
    console.log(
      `  ✔  Lead  ${leadData.applicationId}  (${leadData.fullName})  — ${leadData.status}`
    );

    // Initial "SUBMITTED" audit entry
    const initialAuditId = `33333333-0000-0000-${leadData.id.slice(-4)}-${leadData.id.slice(-12)}`;
    await prisma.auditLog.upsert({
      where: { id: initialAuditId },
      create: {
        id: initialAuditId,
        leadId: leadData.id,
        fromStatus: null,
        toStatus: "SUBMITTED",
        actor: auditActor,
        note: auditNote,
        createdAt: leadData.createdAt,
      },
      update: {},
    });
  }

  // 3. Extra status-transition audit logs
  for (const log of EXTRA_AUDIT_LOGS) {
    await prisma.auditLog.upsert({
      where: { id: log.id },
      create: log,
      update: {},
    });
  }

  console.log("\n✅  Seed complete.\n");
}

main()
  .catch((err) => {
    console.error("❌  Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
