/**
 * apps/api/src/lib/gold.test.ts
 *
 * Compatibility tests — delegates to math.service.ts.
 * Full spec cases live in src/services/math.service.test.ts.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { calculateAppraisal } from "../services/math.service.js";

beforeAll(() => {
  process.env["GOLD_RATE_24K_PAISE"] = "700000";
});

describe("appraise() via math.service", () => {
  it("calculates 24k gold correctly at 70% LTV", () => {
    const result = calculateAppraisal({
      netWeightGrams: 10,
      karat: 24,
      maxLtvPercent: 70,
      rate24kPerGram: 7000,
    });
    expect(result.goldValuePaise).toBe(7_000_000n);
    expect(result.eligibleLoanPaise).toBe(4_900_000n);
    expect(result.rate24kPaise).toBe(700_000n);
  });

  it("calculates 22k gold correctly at 75% LTV", () => {
    const result = calculateAppraisal({
      netWeightGrams: 24,
      karat: 22,
      maxLtvPercent: 75,
      rate24kPerGram: 7000,
    });
    expect(result.goldValuePaise).toBe(15_400_000n);
    expect(result.eligibleLoanPaise).toBe(11_550_000n);
  });

  it("calculates 18k gold correctly", () => {
    const result = calculateAppraisal({
      netWeightGrams: 12,
      karat: 18,
      maxLtvPercent: 70,
      rate24kPerGram: 7000,
    });
    expect(result.goldValuePaise).toBe(6_300_000n);
    expect(result.eligibleLoanPaise).toBe(4_410_000n);
  });

  it("rejects LTV above 75% — caps it instead of throwing", () => {
    const capped = calculateAppraisal({
      netWeightGrams: 10,
      karat: 24,
      maxLtvPercent: 80,
      rate24kPerGram: 7000,
    });
    // Should use 75% not 80%
    expect(capped.effectiveLtvPercent).toBe(75);
  });

  it("rejects unsupported karat", () => {
    expect(() =>
      calculateAppraisal({ netWeightGrams: 10, karat: 21 as 18, maxLtvPercent: 70, rate24kPerGram: 7000 })
    ).toThrow("Unsupported karat");
  });

  it("rejects zero netWeightGrams", () => {
    expect(() =>
      calculateAppraisal({ netWeightGrams: 0, karat: 22, maxLtvPercent: 70, rate24kPerGram: 7000 })
    ).toThrow("netWeightGrams must be positive");
  });
});
