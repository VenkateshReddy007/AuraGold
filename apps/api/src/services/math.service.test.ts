/**
 * apps/api/src/services/math.service.test.ts
 *
 * Spec verification: all three canonical examples from the brief
 * must pass exactly. Rate = ₹7,000/g (700,000 paise/g).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { calculateAppraisal, paiseToRupeesInt } from "./math.service.js";

const RATE = 7_000; // ₹7,000 per gram

beforeAll(() => {
  process.env["GOLD_RATE_24K_PAISE"] = "700000";
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec cases
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateAppraisal() — spec verification cases", () => {
  it("Case 1: 45g net, 22K, 75% LTV (PLAN_EMI_01)", () => {
    const r = calculateAppraisal({
      netWeightGrams: 45,
      karat: 22,
      maxLtvPercent: 75,
      rate24kPerGram: RATE,
    });
    expect(r.pureGoldGrams).toBe("41.2500");
    // goldValue = 41.25 × 7000 = 288,750 rupees = 28,875,000 paise
    expect(r.goldValuePaise).toBe(28_875_000n);
    // eligibleLoan = 288,750 × 75% = 216,562.50 → floored to ₹216,562
    expect(r.eligibleLoanPaise).toBe(21_656_200n);
    expect(paiseToRupeesInt(r.eligibleLoanPaise)).toBe(216_562);
  });

  it("Case 2: 45g net, 22K, 70% LTV (PLAN_BULLET_01)", () => {
    const r = calculateAppraisal({
      netWeightGrams: 45,
      karat: 22,
      maxLtvPercent: 70,
      rate24kPerGram: RATE,
    });
    expect(r.pureGoldGrams).toBe("41.2500");
    expect(r.goldValuePaise).toBe(28_875_000n);
    // eligibleLoan = 288,750 × 70% = 202,125.00 → ₹202,125 exactly
    expect(r.eligibleLoanPaise).toBe(20_212_500n);
    expect(paiseToRupeesInt(r.eligibleLoanPaise)).toBe(202_125);
  });

  it("Case 3: 10g net, 18K, 75% LTV (PLAN_EMI_01)", () => {
    const r = calculateAppraisal({
      netWeightGrams: 10,
      karat: 18,
      maxLtvPercent: 75,
      rate24kPerGram: RATE,
    });
    expect(r.pureGoldGrams).toBe("7.5000");
    // goldValue = 7.5 × 7000 = 52,500 rupees = 5,250,000 paise
    expect(r.goldValuePaise).toBe(5_250_000n);
    // eligibleLoan = 52,500 × 75% = 39,375 exactly
    expect(r.eligibleLoanPaise).toBe(3_937_500n);
    expect(paiseToRupeesInt(r.eligibleLoanPaise)).toBe(39_375);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RBI LTV cap
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateAppraisal() — RBI hard cap", () => {
  it("caps LTV at 75% even if plan has maxLtvPercent = 80", () => {
    const uncapped = calculateAppraisal({
      netWeightGrams: 10,
      karat: 24,
      maxLtvPercent: 80, // plan tries to exceed RBI cap
      rate24kPerGram: RATE,
    });
    const capped = calculateAppraisal({
      netWeightGrams: 10,
      karat: 24,
      maxLtvPercent: 75,
      rate24kPerGram: RATE,
    });
    // Both should produce identical eligible loan amounts
    expect(uncapped.eligibleLoanPaise).toBe(capped.eligibleLoanPaise);
    expect(uncapped.effectiveLtvPercent).toBe(75);
  });

  it("caps LTV at 75% even if plan has maxLtvPercent = 76", () => {
    const r = calculateAppraisal({
      netWeightGrams: 20,
      karat: 22,
      maxLtvPercent: 76,
      rate24kPerGram: RATE,
    });
    expect(r.effectiveLtvPercent).toBe(75);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateAppraisal() — edge cases", () => {
  it("24k gold at 70% LTV is exact (no fractional paise)", () => {
    const r = calculateAppraisal({
      netWeightGrams: 10,
      karat: 24,
      maxLtvPercent: 70,
      rate24kPerGram: RATE,
    });
    expect(r.pureGoldGrams).toBe("10.0000");
    expect(r.goldValuePaise).toBe(7_000_000n);
    expect(r.eligibleLoanPaise).toBe(4_900_000n);
  });

  it("rejects non-positive netWeightGrams", () => {
    expect(() =>
      calculateAppraisal({ netWeightGrams: 0, karat: 22, maxLtvPercent: 70, rate24kPerGram: RATE })
    ).toThrow("netWeightGrams must be positive");
  });

  it("rejects unsupported karat values", () => {
    expect(() =>
      calculateAppraisal({ netWeightGrams: 10, karat: 21 as 18, maxLtvPercent: 70, rate24kPerGram: RATE })
    ).toThrow("Unsupported karat");
  });

  it("rejects non-positive rate", () => {
    expect(() =>
      calculateAppraisal({ netWeightGrams: 10, karat: 22, maxLtvPercent: 70, rate24kPerGram: 0 })
    ).toThrow("rate24kPerGram must be positive");
  });
});
