/**
 * apps/api/src/lib/gold.test.ts
 * Unit tests for the gold appraisal calculation library.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { appraise } from "./gold.js";

beforeAll(() => {
  process.env["GOLD_RATE_24K_PAISE"] = "700000"; // ₹7,000 per gram
});

describe("appraise()", () => {
  it("calculates 24k gold correctly at 70% LTV", () => {
    const result = appraise({
      grossWeightGrams: 10,
      netWeightGrams: 10,
      karat: 24,
      maxLtvPercent: 70,
    });
    // pureGoldGrams = 10 × 24/24 = 10
    // goldValuePaise = 10 × 700_000 = 7_000_000 (₹70,000)
    // eligibleLoanPaise = 7_000_000 × 70/100 = 4_900_000 (₹49,000)
    expect(result.goldValuePaise).toBe(7_000_000n);
    expect(result.eligibleLoanPaise).toBe(4_900_000n);
    expect(result.rate24kPaise).toBe(700_000n);
  });

  it("calculates 22k gold correctly at 75% LTV", () => {
    const result = appraise({
      grossWeightGrams: 24,
      netWeightGrams: 24,
      karat: 22,
      maxLtvPercent: 75,
    });
    // pureGoldGrams = 24 × 22/24 = 22
    // goldValuePaise = 22 × 700_000 = 15_400_000 (₹1,54,000)
    // eligibleLoanPaise = 15_400_000 × 75/100 = 11_550_000 (₹1,15,500)
    expect(result.goldValuePaise).toBe(15_400_000n);
    expect(result.eligibleLoanPaise).toBe(11_550_000n);
  });

  it("calculates 18k gold correctly", () => {
    const result = appraise({
      grossWeightGrams: 12,
      netWeightGrams: 12,
      karat: 18,
      maxLtvPercent: 70,
    });
    // pureGoldGrams = 12 × 18/24 = 9
    // goldValuePaise = 9 × 700_000 = 6_300_000 (₹63,000)
    // eligibleLoanPaise = 6_300_000 × 70/100 = 4_410_000 (₹44,100)
    expect(result.goldValuePaise).toBe(6_300_000n);
    expect(result.eligibleLoanPaise).toBe(4_410_000n);
  });

  it("rejects LTV above 75%", () => {
    expect(() =>
      appraise({
        grossWeightGrams: 10,
        netWeightGrams: 10,
        karat: 24,
        maxLtvPercent: 76,
      })
    ).toThrow("maxLtvPercent cannot exceed 75%");
  });

  it("rejects unsupported karat", () => {
    expect(() =>
      appraise({
        grossWeightGrams: 10,
        netWeightGrams: 10,
        karat: 21 as 18,
        maxLtvPercent: 70,
      })
    ).toThrow("Unsupported karat");
  });

  it("rejects zero netWeightGrams", () => {
    expect(() =>
      appraise({
        grossWeightGrams: 10,
        netWeightGrams: 0,
        karat: 22,
        maxLtvPercent: 70,
      })
    ).toThrow("netWeightGrams must be positive");
  });
});
