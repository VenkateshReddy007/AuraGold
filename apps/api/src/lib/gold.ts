/**
 * apps/api/src/lib/gold.ts
 *
 * Thin re-export shim — delegates entirely to math.service.ts.
 * Kept for backwards-compatibility with any existing import sites.
 *
 * New code should import from ../services/math.service.js directly.
 */

export {
  calculateAppraisal as appraise,
  getRateFromEnv,
  paiseToRupeesInt,
  paiseToRupeesDisplay as paiseToRupees,
} from "../services/math.service.js";

export type { MathInput as AppraiseInput, MathResult as AppraiseResult } from "../services/math.service.js";
