import { quoteInputSchema, type QuoteInput } from "../schemas/validation.js";
import { validationError, zodToFieldErrors } from "../middleware/error.middleware.js";
import { calculateAppraisal, getRateFromEnv } from "./math.service.js";
import { getActiveScheme, listActiveSchemes } from "./scheme.service.js";

export async function calculateQuote(rawInput: unknown) {
  const parsed = quoteInputSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(zodToFieldErrors(parsed.error));
  const input: QuoteInput = parsed.data;
  const schemes = input.planId ? [await getActiveScheme(input.planId)] : await listActiveSchemes();
  const plans = input.planId
    ? schemes
    : schemes.filter((scheme) => scheme.id === "PLAN_EMI_01").concat(
      schemes.filter((scheme) => scheme.id !== "PLAN_EMI_01").slice(0, 1),
    ).slice(0, 1);

  return plans.map((plan) => {
    const appraisal = calculateAppraisal({
      netWeightGrams: input.netWeightGrams,
      karat: input.karat,
      maxLtvPercent: Number(plan.maxLtvPercent),
      rate24kPerGram: getRateFromEnv(),
    });
    return {
      planId: plan.id,
      planName: plan.name,
      pureGoldGrams: appraisal.pureGoldGrams,
      goldValuePaise: appraisal.goldValuePaise.toString(),
      goldValue: appraisal.goldValue,
      goldValueRupees: appraisal.goldValue,
      eligibleLoanPaise: appraisal.eligibleLoanPaise.toString(),
      eligibleLoan: appraisal.eligibleLoan,
      effectiveLtvPercent: appraisal.effectiveLtvPercent,
      rate24kPaise: appraisal.rate24kPaise.toString(),
      rate24kPerGram: Number(appraisal.rate24kPaise) / 100,
    };
  });
}
