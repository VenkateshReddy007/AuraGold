/**
 * apps/api/src/services/math.service.ts
 *
 * Exact Financial Maths Engine — NO floating-point money.
 *
 * All intermediate arithmetic is done in integer paise using
 * numerator/denominator form before the final division by 24,
 * so there is zero rounding drift.
 *
 * Monetary convention:
 *   1 rupee = 100 paise
 *   rate24kPerGram is in RUPEES (e.g. 7000 = ₹7,000 per gram)
 *   All paise results are BigInt
 *
 * RBI hard cap: effective LTV is NEVER above 75%, regardless of
 * what is stored in the plan's maxLtvPercent column.
 *
 * ─────────────────────────────────────────────────────────────────
 * Specification verification (rate24kPerGram = 7000):
 *
 *   45g net, 22K, 75% LTV (PLAN_EMI_01)
 *     pureGoldGrams = 41.25
 *     goldValue     = ₹288,750   (goldValuePaise  = 28,875,000)
 *     eligibleLoan  = ₹216,562   (eligibleLoanPaise = 21,656,250)  [floored]
 *
 *   45g net, 22K, 70% LTV (PLAN_BULLET_01)
 *     pureGoldGrams = 41.25
 *     goldValue     = ₹288,750
 *     eligibleLoan  = ₹202,125   (eligibleLoanPaise = 20,212,500)
 *
 *   10g net, 18K, 75% LTV (PLAN_EMI_01)
 *     pureGoldGrams = 7.5
 *     goldValue     = ₹52,500    (goldValuePaise  = 5,250,000)
 *     eligibleLoan  = ₹39,375    (eligibleLoanPaise = 3,937,500)
 * ─────────────────────────────────────────────────────────────────
 */

/** Maximum LTV ratio mandated by RBI (must never be exceeded). */
const RBI_MAX_LTV = 75n; // percent, integer

/** Scale factor for 4-decimal-place gram precision. */
const GRAM_SCALE = 10_000n; // represents 0.0001 g resolution

export interface MathInput {
  netWeightGrams: number; // e.g. 45.0
  karat: 18 | 22 | 24;
  /** Plan's configured LTV in percent (e.g. 70, 75). Capped to RBI_MAX_LTV. */
  maxLtvPercent: number;
  /** Live 24k gold rate in RUPEES per gram (e.g. 7000 for ₹7,000). */
  rate24kPerGram: number;
}

export interface MathResult {
  /** Pure gold equivalent weight as a string, 4 d.p. (e.g. "41.2500"). */
  pureGoldGrams: string;
  /** Live rate used, in integer paise per gram. */
  rate24kPaise: bigint;
  /** Total gold value in paise (exact integer). */
  goldValuePaise: bigint;
  /** Eligible loan in paise, floored to whole rupees × 100. */
  eligibleLoanPaise: bigint;
  /** Effective LTV actually applied (after RBI cap), as a percentage integer. */
  effectiveLtvPercent: number;
}

/**
 * Calculate gold appraisal figures using pure integer arithmetic.
 *
 * All money is kept in paise throughout. The only division by 24
 * happens once, in integer BigInt arithmetic, before any multiplication
 * by the rate — so no floating-point rounding occurs.
 */
export function calculateAppraisal(input: MathInput): MathResult {
  const { netWeightGrams, karat, maxLtvPercent, rate24kPerGram } = input;

  // ── Input validation ─────────────────────────────────────────────────────
  if (netWeightGrams <= 0) {
    throw new RangeError("netWeightGrams must be positive");
  }
  if (karat !== 18 && karat !== 22 && karat !== 24) {
    throw new RangeError(`Unsupported karat: ${karat}. Must be 18, 22, or 24.`);
  }
  if (rate24kPerGram <= 0) {
    throw new RangeError("rate24kPerGram must be positive");
  }

  // ── RBI LTV cap ──────────────────────────────────────────────────────────
  // Clamp to 75% hard ceiling regardless of plan config.
  const rawLtv = BigInt(Math.round(Math.min(maxLtvPercent, 75) * 100)); // stored as hundredths of %
  const effectiveLtvHundredths = rawLtv > RBI_MAX_LTV * 100n ? RBI_MAX_LTV * 100n : rawLtv;
  const effectiveLtvPercent = Number(effectiveLtvHundredths) / 100;

  // ── Rate: rupees per gram → paise per gram ───────────────────────────────
  // Multiply by 100 to convert ₹/g to paise/g
  const rate24kPaise = BigInt(Math.round(rate24kPerGram * 100));

  // ── pureGoldGrams in scaled integer form ─────────────────────────────────
  // pureGoldGrams = netWeightGrams × karat / 24
  //
  // Exact integer path:
  //   netScaled = round(netWeightGrams × GRAM_SCALE)   [integer, 0.0001g resolution]
  //   pureScaled = netScaled × karat / 24              [BigInt integer division]
  //
  // For 45g 22k:  netScaled = 450000, pureScaled = 450000×22/24 = 412500
  //   → "41.2500"  ✓
  const netScaled = BigInt(Math.round(netWeightGrams * Number(GRAM_SCALE)));
  const pureScaled = (netScaled * BigInt(karat)) / 24n;
  const pureGoldGrams = formatGrams(pureScaled, GRAM_SCALE);

  // ── goldValuePaise ────────────────────────────────────────────────────────
  // goldValuePaise = pureScaled × rate24kPaise / GRAM_SCALE
  //
  // For 45g 22k @ ₹7000/g:
  //   = 412500 × 700000 / 10000 = 28,875,000 paise = ₹288,750  ✓
  const goldValuePaise = (pureScaled * rate24kPaise) / GRAM_SCALE;

  // ── eligibleLoanPaise ─────────────────────────────────────────────────────
  // eligibleLoanPaise = goldValuePaise × effectiveLtvHundredths / 10000
  // Then floor to whole-rupee boundary (floor to nearest 100 paise).
  //
  // For 45g 22k @ 75% LTV:
  //   = 28,875,000 × 7500 / 10000 = 21,656,250 paise = ₹216,562.50
  //   floored to whole rupees → 21,656,200 paise = ₹216,562  ✓
  //
  // For 45g 22k @ 70% LTV:
  //   = 28,875,000 × 7000 / 10000 = 20,212,500 paise = ₹202,125.00
  //   floored → 20,212,500 paise = ₹202,125  ✓
  const rawEligiblePaise =
    (goldValuePaise * effectiveLtvHundredths) / 10_000n;
  // Floor to whole rupee (nearest 100 paise below)
  const eligibleLoanPaise = (rawEligiblePaise / 100n) * 100n;

  return {
    pureGoldGrams,
    rate24kPaise,
    goldValuePaise,
    eligibleLoanPaise,
    effectiveLtvPercent,
  };
}

// ── Convenience: read rate from env ──────────────────────────────────────────

/**
 * Read GOLD_RATE_24K_PAISE from env and convert to rupees per gram.
 * Env stores paise/gram (e.g. 700000 = ₹7,000/g).
 */
export function getRateFromEnv(): number {
  const raw = process.env["GOLD_RATE_24K_PAISE"];
  if (!raw) throw new Error("GOLD_RATE_24K_PAISE env variable is not set");
  const paise = parseInt(raw, 10);
  if (isNaN(paise) || paise <= 0)
    throw new Error(`Invalid GOLD_RATE_24K_PAISE: "${raw}"`);
  // Convert paise/gram → rupees/gram for the math engine
  return paise / 100;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a scaled BigInt as a decimal string with `dp` decimal places. */
function formatGrams(scaled: bigint, scale: bigint): string {
  const whole = scaled / scale;
  const frac = scaled % scale;
  const dp = scale.toString().length - 1; // GRAM_SCALE 10000 → 4 d.p.
  return `${whole}.${frac.toString().padStart(dp, "0")}`;
}

/** Convert paise BigInt to rupees string for display (e.g. "216562"). */
export function paiseToRupeesInt(paise: bigint): number {
  return Number(paise / 100n);
}

/** Convert paise BigInt to display string "₹2,16,562". */
export function paiseToRupeesDisplay(paise: bigint): string {
  const rupees = paise / 100n;
  return `₹${rupees.toLocaleString("en-IN")}`;
}
