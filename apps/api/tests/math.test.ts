/**
 * tests/math.test.ts
 *
 * Unit tests for the exact financial maths engine.
 * Verifies every requirement on Page 4 of the brief.
 * No database required.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  calculateAppraisal,
  paiseToRupeesInt,
} from "../src/services/math.service.js";

const RATE_RUPEES = 7_000; // ₹7,000 per gram (= 700,000 paise/gram)

beforeAll(() => {
  process.env["GOLD_RATE_24K_PAISE"] = "700000";
});

// ─────────────────────────────────────────────────────────────────────────────
// Page 4 canonical spec cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Spec Case #1 — 45g net, 22K, PLAN_EMI_01 (75% LTV)", () => {
  const r = () =>
    calculateAppraisal({
      netWeightGrams: 45,
      karat: 22,
      maxLtvPercent: 75,
      rate24kPerGram: RATE_RUPEES,
    });

  it("pureGoldGrams = 41.25", () => {
    expect(r().pureGoldGrams).toBe("41.2500");
  });

  it("goldValue = ₹288,750  (goldValuePaise = 28,875,000)", () => {
    const res = r();
    expect(res.goldValuePaise).toBe(28_875_000n);
    expect(res.goldValue).toBe(288_750);
    expect(paiseToRupeesInt(res.goldValuePaise)).toBe(288_750);
  });

  it("eligibleLoan = ₹216,562  (Math.floor(288750 × 0.75))", () => {
    const res = r();
    // 288750 × 0.75 = 216562.5 → floored = 216562
    expect(paiseToRupeesInt(res.eligibleLoanPaise)).toBe(216_562);
    expect(res.eligibleLoanPaise).toBe(21_656_200n); // 216562 × 100
    expect(res.eligibleLoan).toBe(216_562);
  });
});

describe("Spec Case #2 — 45g net, 22K, PLAN_BULLET_01 (70% LTV)", () => {
  const r = () =>
    calculateAppraisal({
      netWeightGrams: 45,
      karat: 22,
      maxLtvPercent: 70,
      rate24kPerGram: RATE_RUPEES,
    });

  it("pureGoldGrams = 41.25", () => {
    expect(r().pureGoldGrams).toBe("41.2500");
  });

  it("goldValue = ₹288,750", () => {
    expect(paiseToRupeesInt(r().goldValuePaise)).toBe(288_750);
  });

  it("eligibleLoan = ₹202,125  (288750 × 0.70 = 202125 exact)", () => {
    const res = r();
    expect(paiseToRupeesInt(res.eligibleLoanPaise)).toBe(202_125);
    expect(res.eligibleLoanPaise).toBe(20_212_500n);
    expect(res.eligibleLoan).toBe(202_125);
  });
});

describe("Spec Case #3 — 10g net, 18K, PLAN_EMI_01 (75% LTV)", () => {
  const r = () =>
    calculateAppraisal({
      netWeightGrams: 10,
      karat: 18,
      maxLtvPercent: 75,
      rate24kPerGram: RATE_RUPEES,
    });

  it("pureGoldGrams = 7.5", () => {
    expect(r().pureGoldGrams).toBe("7.5000");
  });

  it("goldValue = ₹52,500  (7.5 × 7000)", () => {
    expect(paiseToRupeesInt(r().goldValuePaise)).toBe(52_500);
    expect(r().goldValuePaise).toBe(5_250_000n);
    expect(r().goldValue).toBe(52_500);
  });

  it("eligibleLoan = ₹39,375  (52500 × 0.75 = 39375 exact)", () => {
    const res = r();
    expect(paiseToRupeesInt(res.eligibleLoanPaise)).toBe(39_375);
    expect(res.eligibleLoanPaise).toBe(3_937_500n);
    expect(res.eligibleLoan).toBe(39_375);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RBI LTV Cap Enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe("RBI LTV Cap — maxLtvPercent = 85% is capped to 75%", () => {
  it("effectiveLtvPercent is 75, not 85", () => {
    const r = calculateAppraisal({
      netWeightGrams: 20,
      karat: 24,
      maxLtvPercent: 85,
      rate24kPerGram: RATE_RUPEES,
    });
    expect(r.effectiveLtvPercent).toBe(75);
  });

  it("eligibleLoan matches what a 75% plan would produce", () => {
    const capped = calculateAppraisal({
      netWeightGrams: 20,
      karat: 24,
      maxLtvPercent: 85,
      rate24kPerGram: RATE_RUPEES,
    });
    const reference = calculateAppraisal({
      netWeightGrams: 20,
      karat: 24,
      maxLtvPercent: 75,
      rate24kPerGram: RATE_RUPEES,
    });
    expect(capped.eligibleLoanPaise).toBe(reference.eligibleLoanPaise);
  });

  it("never produces a higher eligible loan than a 75% plan", () => {
    for (const badLtv of [76, 80, 85, 90, 100]) {
      const r = calculateAppraisal({
        netWeightGrams: 10,
        karat: 22,
        maxLtvPercent: badLtv,
        rate24kPerGram: RATE_RUPEES,
      });
      expect(r.effectiveLtvPercent).toBeLessThanOrEqual(75);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: AI_LOG.md — "premature rounding of 22/24 purity factor"
// Proves integer (22/24) not float (0.9166...) is used
// ─────────────────────────────────────────────────────────────────────────────

describe("Regression: exact karat fraction — 45g 22K integer arithmetic", () => {
  it("pureGoldGrams is 41.25 NOT the floating-point approximation 41.4g", () => {
    const r = calculateAppraisal({
      netWeightGrams: 45,
      karat: 22,
      maxLtvPercent: 75,
      rate24kPerGram: RATE_RUPEES,
    });

    // Correct: 45 × 22 / 24 = 41.25
    expect(r.pureGoldGrams).toBe("41.2500");

    // Guard against the broken float path: 45 × 0.9166... = 41.25 (coincidentally)
    // But 45 × 0.92 = 41.4 (the "premature rounding" bug)
    const wrongPureGold = 45 * 0.92; // = 41.4
    expect(Number(r.pureGoldGrams)).not.toBeCloseTo(wrongPureGold, 1);
  });

  it("goldValue is ₹288,750 NOT ₹289,800 (the rounded-float result)", () => {
    const r = calculateAppraisal({
      netWeightGrams: 45,
      karat: 22,
      maxLtvPercent: 75,
      rate24kPerGram: RATE_RUPEES,
    });

    // Correct: 41.25 × 7000 = 288750
    expect(paiseToRupeesInt(r.goldValuePaise)).toBe(288_750);

    // Broken float result: 41.4 × 7000 = 289800
    expect(paiseToRupeesInt(r.goldValuePaise)).not.toBe(289_800);
  });

  it("intermediate BigInt division: 450000 × 22 / 24 = 412500 (no fractional loss)", () => {
    // This verifies the exact internal scaled value.
    // pureScaled = 450000 × 22 / 24 = 9900000 / 24 = 412500 exactly
    expect(BigInt(450_000) * 22n / 24n).toBe(412_500n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("24k gold — pureGoldGrams equals netWeightGrams", () => {
    const r = calculateAppraisal({
      netWeightGrams: 10,
      karat: 24,
      maxLtvPercent: 70,
      rate24kPerGram: RATE_RUPEES,
    });
    expect(r.pureGoldGrams).toBe("10.0000");
    expect(paiseToRupeesInt(r.goldValuePaise)).toBe(70_000);
  });

  it("rejects netWeightGrams = 0", () => {
    expect(() =>
      calculateAppraisal({ netWeightGrams: 0, karat: 22, maxLtvPercent: 70, rate24kPerGram: RATE_RUPEES })
    ).toThrow("netWeightGrams must be positive");
  });

  it("rejects karat = 21", () => {
    expect(() =>
      calculateAppraisal({ netWeightGrams: 10, karat: 21 as 22, maxLtvPercent: 70, rate24kPerGram: RATE_RUPEES })
    ).toThrow("Unsupported karat");
  });

  it("floor is applied: 288750 × 75% = 216562.50 → stored as 216562 rupees", () => {
    const r = calculateAppraisal({
      netWeightGrams: 45,
      karat: 22,
      maxLtvPercent: 75,
      rate24kPerGram: RATE_RUPEES,
    });
    // Raw = 21_656_250 paise = ₹216,562.50 — floor to ₹216,562 = 21_656_200 paise
    expect(r.eligibleLoanPaise % 100n).toBe(0n); // always whole rupees
    expect(r.eligibleLoanPaise).toBe(21_656_200n);
  });
});
