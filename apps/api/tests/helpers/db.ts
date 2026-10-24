/**
 * tests/helpers/db.ts
 *
 * Integration test DB helpers.
 *
 * IMPORTANT: imports the shared Prisma singleton from src/lib/prisma.ts
 * so there is exactly ONE connection pool per worker — no teardown hang.
 */

// Re-export the app's own Prisma singleton so tests and the Express app
// share the same connection pool within a worker.
export { prisma } from "../../src/lib/prisma.js";
import { prisma } from "../../src/lib/prisma.js";

/**
 * Delete all transient rows (leads, audit logs, idempotency records).
 * Keeps LoanScheme rows (seeded reference data).
 * FK-safe deletion order: AuditLog → IdempotencyRecord → Lead
 */
export async function resetDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.lead.deleteMany();
}

/** Idempotent upsert of the two required loan schemes. */
export async function ensurePlans(): Promise<void> {
  await prisma.loanScheme.upsert({
    where: { id: "PLAN_BULLET_01" },
    create: {
      id: "PLAN_BULLET_01",
      name: "Bullet Repayment",
      interestRatePa: 12.0,
      maxLtvPercent: 70.0,
      tenureMonths: 12,
      description: "12 months, interest + principal at maturity",
      isActive: true,
    },
    update: {},
  });
  await prisma.loanScheme.upsert({
    where: { id: "PLAN_EMI_01" },
    create: {
      id: "PLAN_EMI_01",
      name: "Monthly EMI",
      interestRatePa: 10.5,
      maxLtvPercent: 75.0,
      tenureMonths: 12,
      description: "12 months, equal monthly instalments",
      isActive: true,
    },
    update: {},
  });
}
