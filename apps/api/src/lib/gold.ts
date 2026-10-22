/**
 * apps/api/src/lib/gold.ts
 *
 * Pure gold appraisal calculations.
 *
 * Convention:
 *   - All monetary outputs are BigInt paise (integer, no floats).
 *   - Weight inputs are numbers (grams, up to 4 decimal places).
 *   - Rate is sourced from env GOLD_RATE_24K_PAISE.
 *
 * Formula:
 *   pureGoldGrams      = netWeightGrams × (karat / 24)
 *   goldValuePaise     = pureGoldGrams × rate24kPaise
 *   eligibleLoanPaise  = goldValuePaise × (maxLtvPercent / 100)
 */

const SCALE = 10_000n; // 4 decimal places of precision for gram arithmetic

export interface AppraiseInput {
  grossWeightGrams: number;
  netWeightGrams: number;
  karat: number; // 18 | 22 | 24
  maxLtvPercent: number; // e.g. 70.0, 75.0
}

export interface AppraiseResult {
  pureGoldGrams: string;       // Decimal string, e.g. "22.0000"
  rate24kPaise: bigint;
  goldValuePaise: bigint;
  eligibleLoanPaise: bigint;
}

function getRate24kPaise(): bigint {
  const raw = process.env["GOLD_RATE_24K_PAISE"];
  if (!raw) throw new Error("GOLD_RATE_24K_PAISE env variable is not set");
  const rate = parseInt(raw, 10);
  if (isNaN(rate) || rate <= 0) {
    throw new Error(`Invalid GOLD_RATE_24K_PAISE value: ${raw}`);
  }
  return BigInt(rate);
}

export function appraise(input: AppraiseInput): AppraiseResult {
  const { netWeightGrams, karat, maxLtvPercent } = input;

  if (karat !== 18 && karat !== 22 && karat !== 24) {
    throw new Error(`Unsupported karat: ${karat}. Must be 18, 22, or 24.`);
  }
  if (netWeightGrams <= 0) {
    throw new Error("netWeightGrams must be positive");
  }
  if (maxLtvPercent > 75) {
    throw new Error("maxLtvPercent cannot exceed 75% per RBI guidelines");
  }

  const rate24kPaise = getRate24kPaise();

  // Compute pureGoldGrams using integer arithmetic scaled by SCALE
  // pureGoldGrams_scaled = round(netWeightGrams × karat × SCALE / 24)
  const netWeightScaled = BigInt(Math.round(netWeightGrams * Number(SCALE)));
  const pureGoldScaled = (netWeightScaled * BigInt(karat)) / 24n;
  const pureGoldGramsStr = formatDecimal(pureGoldScaled, SCALE, 4);

  // goldValuePaise = pureGoldScaled × rate24kPaise / SCALE
  const goldValuePaise = (pureGoldScaled * rate24kPaise) / SCALE;

  // eligibleLoanPaise = goldValuePaise × maxLtvPercent / 100
  // Use integer arithmetic: multiply by (maxLtvPercent × 100) then divide by 10000
  const ltvNumerator = BigInt(Math.round(maxLtvPercent * 100));
  const eligibleLoanPaise = (goldValuePaise * ltvNumerator) / 10_000n;

  return {
    pureGoldGrams: pureGoldGramsStr,
    rate24kPaise,
    goldValuePaise,
    eligibleLoanPaise,
  };
}

/** Format a BigInt scaled value as a decimal string. */
function formatDecimal(scaled: bigint, scale: bigint, decimals: number): string {
  const whole = scaled / scale;
  const frac = scaled % scale;
  return `${whole}.${frac.toString().padStart(decimals, "0")}`;
}

/** Convert paise (BigInt) to a rupee display string. */
export function paiseToRupees(paise: bigint): string {
  const rupees = paise / 100n;
  const remainingPaise = paise % 100n;
  return `₹${rupees.toLocaleString("en-IN")}.${remainingPaise.toString().padStart(2, "0")}`;
}
