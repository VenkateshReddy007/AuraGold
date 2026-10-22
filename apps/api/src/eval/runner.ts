/**
 * apps/api/src/eval/runner.ts
 *
 * AI Agent Evaluation Suite (Phase 2 implementation target).
 *
 * Runs a set of scenario-based tests against the AI agent, measuring:
 *   - Intent recognition accuracy
 *   - Tool-calling correctness
 *   - Gold appraisal calculation accuracy
 *   - Duplicate-detection adherence
 *
 * Usage: npm run eval (from root)  |  tsx src/eval/runner.ts (directly)
 */

import "dotenv/config";

interface EvalCase {
  id: string;
  description: string;
  userMessage: string;
  expectedIntent: string;
  expectedToolCall?: string;
}

const EVAL_CASES: EvalCase[] = [
  {
    id: "EVAL_001",
    description: "Customer submits a new lead via AI agent",
    userMessage: "I want a gold loan. My name is Ananya, mobile 9876500001. I have 20 grams of 22k gold.",
    expectedIntent: "SUBMIT_LEAD",
    expectedToolCall: "submit_lead",
  },
  {
    id: "EVAL_002",
    description: "Customer asks for eligible loan amount",
    userMessage: "How much loan can I get on 15 grams of 24k gold?",
    expectedIntent: "CALCULATE_LOAN",
    expectedToolCall: "calculate_loan",
  },
  {
    id: "EVAL_003",
    description: "Customer checks status of existing application",
    userMessage: "What is the status of my application GL-1042?",
    expectedIntent: "CHECK_STATUS",
    expectedToolCall: "get_lead_status",
  },
  {
    id: "EVAL_004",
    description: "Customer asks about available plans",
    userMessage: "What loan plans do you have?",
    expectedIntent: "LIST_SCHEMES",
    expectedToolCall: "list_schemes",
  },
];

async function runEval() {
  console.log("🧪  TGlobal Gold Loan – AI Agent Evaluation Suite\n");
  console.log(`   Running ${EVAL_CASES.length} evaluation cases…\n`);

  let passed = 0;
  let failed = 0;

  for (const evalCase of EVAL_CASES) {
    // Phase 2: replace with actual agent call
    const result = {
      intent: "[STUB – Phase 2]",
      toolCall: "[STUB – Phase 2]",
    };

    const intentMatch = result.intent === evalCase.expectedIntent;
    const toolMatch =
      !evalCase.expectedToolCall || result.toolCall === evalCase.expectedToolCall;

    if (intentMatch && toolMatch) {
      passed++;
      console.log(`  ✅  ${evalCase.id}: ${evalCase.description}`);
    } else {
      failed++;
      console.log(`  ❌  ${evalCase.id}: ${evalCase.description}`);
      if (!intentMatch) {
        console.log(`       intent: expected="${evalCase.expectedIntent}" got="${result.intent}"`);
      }
      if (!toolMatch) {
        console.log(`       tool:   expected="${evalCase.expectedToolCall}" got="${result.toolCall}"`);
      }
    }
  }

  console.log(`\n📊  Results: ${passed} passed / ${failed} failed / ${EVAL_CASES.length} total`);

  if (failed > 0) {
    console.log("\n⚠️  Some evaluations failed (expected in Phase 1 — stubs not yet connected).\n");
    process.exit(0); // Non-fatal in Phase 1
  } else {
    console.log("\n✅  All evaluations passed.\n");
  }
}

runEval().catch((err) => {
  console.error("❌  Eval runner crashed:", err);
  process.exit(1);
});
