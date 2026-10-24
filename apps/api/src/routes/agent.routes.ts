import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { chatWithAgent } from "../agent/agent.service.js";
import { executeAgentTool, safeLeadFilterSchema } from "../agent/tools.js";
import { quoteInputSchema } from "../schemas/validation.js";
import { validationError, zodToFieldErrors } from "../middleware/error.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";

export const agentRoutes = Router();

const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(30).optional(),
  confirmSubmission: z.boolean().optional(),
});

agentRoutes.post("/chat", rateLimit({ scope: "agent-chat", max: Number(process.env["AGENT_CHAT_RATE_LIMIT_MAX"] ?? 30) }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) return next(validationError(zodToFieldErrors(parsed.error)));
    const result = await chatWithAgent({ ...parsed.data, sessionId: parsed.data.sessionId ?? randomUUID() });
    return res.json(result);
  } catch (error) { return next(error); }
});

const slipSchema = z.object({
  imageBase64: z.string().max(12_000_000).optional(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  presetSlipType: z.enum(["sample-22k", "sample-18k", "sample-24k"]).optional(),
}).refine((data) => Boolean(data.imageBase64 || data.presetSlipType), {
  message: "Provide an image or choose a demo slip preset",
  path: ["imageBase64"],
});

const SAMPLE_SLIPS = {
  "sample-22k": { grossWeightGrams: 48, netWeightGrams: 45, karat: 22 as const, jewellerName: "Lakshmi Gold Works", confidence: 0.98 },
  "sample-18k": { grossWeightGrams: 12, netWeightGrams: 10, karat: 18 as const, jewellerName: "Sri Ganesh Jewellers", confidence: 0.98 },
  "sample-24k": { grossWeightGrams: 20, netWeightGrams: 19.8, karat: 24 as const, jewellerName: "Demo Gold Assay Centre", confidence: 0.98 },
};

agentRoutes.post("/extract-slip", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = slipSchema.safeParse(req.body);
    if (!parsed.success) return next(validationError(zodToFieldErrors(parsed.error)));
    if (parsed.data.presetSlipType) {
      const extracted = SAMPLE_SLIPS[parsed.data.presetSlipType];
      return res.json({ success: true, data: extracted, source: "demo-preset" });
    }
    const key = process.env["GEMINI_API_KEY"];
    if (key && parsed.data.imageBase64 && parsed.data.mimeType) {
      try {
        const extracted = await extractWithGemini(parsed.data.imageBase64, parsed.data.mimeType, key);
        return res.json({ success: true, data: extracted, source: "gemini-vision" });
      } catch {
        // A quota/network failure falls through to the local text OCR fallback.
      }
    }
    const extracted = parsePlainTextSlip(parsed.data.imageBase64 ?? "");
    if (!extracted) {
      return res.status(422).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Could not read this appraisal slip. Try a clearer image or use a demo preset." } });
    }
    return res.json({ success: true, data: extracted, source: "text-ocr-fallback" });
  } catch (error) { return next(error); }
});

const adminQuerySchema = z.object({ query: z.string().trim().min(1).max(500) });
agentRoutes.post("/admin-filter", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = adminQuerySchema.safeParse(req.body);
    if (!parsed.success) return next(validationError(zodToFieldErrors(parsed.error)));
    const filters = parseAdminFilter(parsed.data.query);
    const checked = safeLeadFilterSchema.safeParse(filters);
    if (!checked.success) return next(validationError(zodToFieldErrors(checked.error)));
    const result = await executeAgentTool("filter_leads_safe", checked.data, { sessionId: "admin-filter" });
    if (!result.success) return res.status(400).json({ success: false, error: result.error });
    const leads = (result.data as Array<any>).map((lead) => ({
      applicationId: lead.applicationId,
      fullName: lead.fullName,
      mobileNumber: maskMobile(lead.mobileNumber),
      grossWeightGrams: String(lead.grossWeightGrams),
      netWeightGrams: String(lead.netWeightGrams),
      karat: lead.karat,
      pureGoldGrams: String(lead.pureGoldGrams),
      goldValuePaise: String(lead.goldValuePaise),
      goldValue: Number(BigInt(lead.goldValuePaise) / 100n),
      status: lead.status,
      eligibleLoanPaise: String(lead.eligibleLoanPaise),
      eligibleLoan: Number(BigInt(lead.eligibleLoanPaise) / 100n),
      plan: lead.plan ? { id: lead.plan.id, name: lead.plan.name } : null,
      createdAt: lead.createdAt,
    }));
    return res.json({ success: true, query: parsed.data.query, filters: checked.data, count: leads.length, data: leads });
  } catch (error) { return next(error); }
});

function parseAdminFilter(query: string) {
  const lower = query.toLowerCase();
  const filters: Record<string, unknown> = {};
  if (/\b18\s*k\b/.test(lower)) filters.karat = 18;
  else if (/\b22\s*k\b/.test(lower)) filters.karat = 22;
  else if (/\b24\s*k\b/.test(lower)) filters.karat = 24;
  if (/\bunder review\b|\bpending review\b/.test(lower)) filters.status = "UNDER_REVIEW";
  else if (/\bapproved\b/.test(lower)) filters.status = "APPROVED";
  else if (/\brejected\b/.test(lower)) filters.status = "REJECTED";
  else if (/\bsubmitted\b/.test(lower)) filters.status = "SUBMITTED";
  if (/\bemi\b|\bmonthly\b/.test(lower)) filters.planId = "PLAN_EMI_01";
  else if (/\bbullet\b/.test(lower)) filters.planId = "PLAN_BULLET_01";
  const minMatch = lower.match(/(?:above|over|more than|at least)\s*(?:₹|rs\.?\s*)?([\d,.]+)\s*(lakh|lakhs|l|thousand|k)?/);
  const maxMatch = lower.match(/(?:below|under|less than|at most)\s*(?:₹|rs\.?\s*)?([\d,.]+)\s*(lakh|lakhs|l|thousand|k)?/);
  if (minMatch) filters.minLoanRupees = parseAmount(minMatch[1]!, minMatch[2]);
  if (maxMatch) filters.maxLoanRupees = parseAmount(maxMatch[1]!, maxMatch[2]);
  return filters;
}

function parseAmount(raw: string, unit?: string) {
  const number = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(number)) return -1;
  if (unit && /^(lakh|lakhs|l)$/.test(unit)) return Math.round(number * 100_000);
  if (unit && /^(thousand|k)$/.test(unit)) return Math.round(number * 1_000);
  return Math.round(number);
}

async function extractWithGemini(imageBase64: string, mimeType: string, key: string) {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "Extract only visible appraisal-slip facts. Return JSON with grossWeightGrams, netWeightGrams, karat (18,22,24), jewellerName, confidence (0 to 1). Do not infer missing values; use null." }] },
      contents: [{ role: "user", parts: [{ text: "Read this gold appraisal slip." }, { inlineData: { mimeType, data: imageBase64 } }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }), signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Vision extractor returned ${resp.status}`);
  const data = await resp.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  const extracted = JSON.parse(text);
  const verified = quoteInputSchema.safeParse({ grossWeightGrams: extracted.grossWeightGrams, netWeightGrams: extracted.netWeightGrams, karat: extracted.karat });
  if (!verified.success) throw validationError(zodToFieldErrors(verified.error));
  return { ...verified.data, jewellerName: typeof extracted.jewellerName === "string" ? extracted.jewellerName.slice(0, 100) : undefined, confidence: Math.max(0, Math.min(1, Number(extracted.confidence) || 0)) };
}

function parsePlainTextSlip(imageBase64: string) {
  try {
    const text = Buffer.from(imageBase64, "base64").toString("utf8");
    const gross = text.match(/gross\s*(?:weight)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i)?.[1];
    const net = text.match(/net\s*(?:weight)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i)?.[1];
    const karat = text.match(/\b(18|22|24)\s*k\b/i)?.[1];
    if (!gross || !net || !karat) return null;
    const checked = quoteInputSchema.safeParse({ grossWeightGrams: Number(gross), netWeightGrams: Number(net), karat: Number(karat) });
    return checked.success ? { ...checked.data, jewellerName: text.match(/(?:jeweller|jeweler)\s*[:=]\s*([^\n\r]+)/i)?.[1]?.slice(0, 100), confidence: 0.55 } : null;
  } catch { return null; }
}

function maskMobile(mobile: string) { return mobile.length === 10 ? `${mobile.slice(0, 4)}XXXX${mobile.slice(8)}` : "[masked]"; }
