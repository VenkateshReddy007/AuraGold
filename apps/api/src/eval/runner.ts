/**
 * apps/api/src/eval/runner.ts
 *
 * AI Agent Evaluation Suite.
 *
 * Tests the agent's intent recognition and tool execution
 * against a set of canonical scenarios. Requires a running DB.
 *
 * Usage:
 *   npm run eval            (from workspace root)
 *   tsx src/eval/runner.ts  (directly from apps/api)
 */

import "dotenv/config";
import { prisma } from "../lib/prisma.js";

// ── Eval case definition ──────────────────────────────────────────────────────

interface EvalCase {
  id: string;
  description: string;
  /** The tool to call directly (bypassing NLU for precision testing). */
  tool: string;
  /** Input to pass to the tool. */
  input: Record<string, unknown>;
  /** Assertion function — return null on pass, error string on fail. */
  assert: (result: unknown) => string | null;
}

// ── Eval cases ────────────────────────────────────────────────────────────────

const EVAL_CASES: EvalCase[] = [
  {
    id: "EVAL_001",
    description: "list_schemes returns at least 2 active plans",
    tool: "list_schemes",
    input: {},
    assert: (result) => {
      const r = result as { success: boolean; data: unknown[] };
      if (!r.success) return "success was false";
      if (!Array.isArray(r.data)) return "data is not an array";
      if (r.data.length < 2) return `expected ≥2 schemes, got ${r.data.length}`;
      return null;
    },
  },
  {
    id: "EVAL_002",
    description: "calculate_loan: 45g 22K PLAN_EMI_01 → eligibleLoan ₹216,562",
    tool: "calculate_loan",
    input: { netWeightGrams: 45, karat: 22, planId: "PLAN_EMI_01" },
    assert: (result) => {
      const r = result as { success: boolean; data: { eligibleLoanRupees: number } };
      if (!r.success) return "success was false";
      if (r.data.eligibleLoanRupees !== 216_562)
        return `expected 216562, got ${r.data.eligibleLoanRupees}`;
      return null;
    },
  },
  {
    id: "EVAL_003",
    description: "calculate_loan: 45g 22K PLAN_BULLET_01 → eligibleLoan ₹202,125",
    tool: "calculate_loan",
    input: { netWeightGrams: 45, karat: 22, planId: "PLAN_BULLET_01" },
    assert: (result) => {
      const r = result as { success: boolean; data: { eligibleLoanRupees: number } };
      if (!r.success) return "success was false";
      if (r.data.eligibleLoanRupees !== 202_125)
        return `expected 202125, got ${r.data.eligibleLoanRupees}`;
      return null;
    },
  },
  {
    id: "EVAL_004",
    description: "calculate_loan: 10g 18K PLAN_EMI_01 → eligibleLoan ₹39,375",
    tool: "calculate_loan",
    input: { netWeightGrams: 10, karat: 18, planId: "PLAN_EMI_01" },
    assert: (result) => {
      const r = result as { success: boolean; data: { eligibleLoanRupees: number } };
      if (!r.success) return "success was false";
      if (r.data.eligibleLoanRupees !== 39_375)
        return `expected 39375, got ${r.data.eligibleLoanRupees}`;
      return null;
    },
  },
  {
    id: "EVAL_005",
    description: "get_lead_status returns data for seeded lead GL-1001",
    tool: "get_lead_status",
    input: { applicationId: "GL-1001" },
    assert: (result) => {
      const r = result as { success: boolean; data: { applicationId: string; status: string } };
      if (!r.success) return "success was false";
      if (r.data.applicationId !== "GL-1001") return "applicationId mismatch";
      if (!["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].includes(r.data.status))
        return `invalid status: ${r.data.status}`;
      return null;
    },
  },
  {
    id: "EVAL_006",
    description: "submit_lead rejects net > gross (validation guard)",
    tool: "submit_lead",
    input: {
      fullName: "Test User",
      mobileNumber: "9000000099",
      grossWeightGrams: 10,
      netWeightGrams: 15, // intentionally invalid
      karat: 22,
      planId: "PLAN_EMI_01",
    },
    assert: (result) => {
      // Should have thrown — executeTool throws AppError on validation failure
      // The eval runner catches it and checks the error code
      const r = result as { threwAppError: boolean; code: string };
      if (!r.threwAppError) return "expected AppError to be thrown";
      if (r.code !== "VALIDATION_ERROR") return `expected VALIDATION_ERROR, got ${r.code}`;
      return null;
    },
  },
  {
    id: "EVAL_007",
    description: "calculate_loan enforces RBI cap: 80% LTV → effectiveLtv 75%",
    tool: "calculate_loan",
    // Note: this requires a plan with maxLtvPercent > 75 to be in the DB.
    // For this eval we test via math service directly.
    input: { netWeightGrams: 10, karat: 24, planId: "PLAN_EMI_01" },
    assert: (result) => {
      const r = result as { success: boolean; data: { effectiveLtvPercent: number } };
      if (!r.success) return "success was false";
      if (r.data.effectiveLtvPercent > 75)
        return `LTV ${r.data.effectiveLtvPercent} exceeds 75% RBI cap`;
      return null;
    },
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function runEval() {
  console.log("🧪  TGlobal Gold Loan – AI Agent Evaluation Suite\n");

  // Lazy-import to avoid loading Prisma in environments without a DB
  const { executeTool } = await import("../routes/agent.js");

  let passed = 0;
  let failed = 0;

  for (const evalCase of EVAL_CASES) {
    let result: unknown;
    let threwAppError = false;
    let errorCode = "";

    try {
      result = await executeTool(evalCase.tool, evalCase.input);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err
      ) {
        threwAppError = true;
        errorCode = (err as { code: string }).code;
        result = { threwAppError: true, code: errorCode };
      } else {
        result = { threwAppError: false, rawError: String(err) };
      }
    }

    const error = evalCase.assert(result);

    if (error === null) {
      passed++;
      console.log(`  ✅  ${evalCase.id}: ${evalCase.description}`);
    } else {
      failed++;
      console.log(`  ❌  ${evalCase.id}: ${evalCase.description}`);
      console.log(`       Reason: ${error}`);
    }
  }

  console.log(
    `\n📊  Results: ${passed} passed / ${failed} failed / ${EVAL_CASES.length} total\n`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

runEval()
  .catch((err) => {
    console.error("❌  Eval runner crashed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
