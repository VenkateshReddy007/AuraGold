/**
 * apps/api/src/routes/agent.ts
 *
 * POST /api/v1/agent/chat — AI agent conversation endpoint.
 *
 * The agent uses a tool-calling loop with three tools that share
 * the exact same Zod schemas as the REST controllers:
 *
 *   submit_lead      — validated by agentSubmitLeadSchema
 *   calculate_loan   — validated by agentCalculateLoanSchema
 *   get_lead_status  — validated by agentGetLeadStatusSchema
 *   list_schemes     — no input schema needed
 *
 * Phase 2: LLM routing is wired; the provider is selected via
 * LLM_PROVIDER env var (gemini | groq | ollama | mock).
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  agentSubmitLeadSchema,
  agentCalculateLoanSchema,
  agentGetLeadStatusSchema,
} from "../schemas/validation.js";
import { calculateAppraisal, getRateFromEnv } from "../services/math.service.js";
import { getGoldRate } from "../services/goldRate.service.js";
import {
  AppError,
  zodToFieldErrors,
  validationError,
  duplicateApplication,
} from "../middleware/error.middleware.js";
import { generateApplicationId } from "../lib/applicationId.js";

export const agentRouter = Router();

// ── Chat schema ───────────────────────────────────────────────────────────────

const chatSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  sessionId: z.string().uuid().optional(),
});

// ── Tool definitions (shared with eval runner) ────────────────────────────────

export const AGENT_TOOLS = [
  {
    name: "submit_lead",
    description:
      "Submit a new gold loan application on behalf of a customer. Requires name, mobile number, gold weight (gross and net), karat purity, and a plan ID.",
    inputSchema: agentSubmitLeadSchema,
  },
  {
    name: "calculate_loan",
    description:
      "Calculate the eligible loan amount for a given gold weight, karat, and plan without submitting an application.",
    inputSchema: agentCalculateLoanSchema,
  },
  {
    name: "get_lead_status",
    description: "Check the status of an existing gold loan application by its application ID.",
    inputSchema: agentGetLeadStatusSchema,
  },
  {
    name: "list_schemes",
    description: "List all active gold loan plans/schemes available.",
    inputSchema: z.object({}),
  },
] as const;

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  rawArgs: unknown
): Promise<{ success: boolean; data: unknown }> {
  switch (toolName) {
    case "submit_lead": {
      const parsed = agentSubmitLeadSchema.safeParse(rawArgs);
      if (!parsed.success) {
        throw validationError(zodToFieldErrors(parsed.error));
      }
      const args = parsed.data;

      // 7-day duplicate mobile check
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
      const recent = await prisma.lead.findFirst({
        where: { mobileNumber: args.mobileNumber, createdAt: { gte: sevenDaysAgo } },
        select: { applicationId: true, createdAt: true },
      });
      if (recent) throw duplicateApplication(recent.applicationId, recent.createdAt);

      const plan = await prisma.loanScheme.findFirst({
        where: { id: args.planId, isActive: true },
      });
      if (!plan) {
        throw new AppError("NOT_FOUND", `Plan "${args.planId}" not found or inactive.`);
      }

      const rate = getRateFromEnv();
      const appraisal = calculateAppraisal({
        netWeightGrams: args.netWeightGrams,
        karat: args.karat,
        maxLtvPercent: Number(plan.maxLtvPercent),
        rate24kPerGram: rate,
      });

      const applicationId = await generateApplicationId();

      const lead = await prisma.$transaction(async (tx) => {
        const created = await tx.lead.create({
          data: {
            applicationId,
            fullName: args.fullName.trim(),
            mobileNumber: args.mobileNumber,
            grossWeightGrams: args.grossWeightGrams,
            netWeightGrams: args.netWeightGrams,
            karat: args.karat,
            pureGoldGrams: appraisal.pureGoldGrams,
            rate24kPaise: appraisal.rate24kPaise,
            goldValuePaise: appraisal.goldValuePaise,
            eligibleLoanPaise: appraisal.eligibleLoanPaise,
            planId: args.planId,
            source: "AI_AGENT",
          },
          include: { plan: true },
        });
        await tx.auditLog.create({
          data: {
            leadId: created.id,
            fromStatus: null,
            toStatus: "SUBMITTED",
            actor: "AI_AGENT",
            note: "Application submitted via AI agent",
          },
        });
        return created;
      });

      return {
        success: true,
        data: serialiseBigInt(lead),
      };
    }

    case "calculate_loan": {
      const parsed = agentCalculateLoanSchema.safeParse(rawArgs);
      if (!parsed.success) throw validationError(zodToFieldErrors(parsed.error));
      const args = parsed.data;

      const plan = await prisma.loanScheme.findFirst({
        where: { id: args.planId, isActive: true },
      });
      if (!plan) {
        throw new AppError("NOT_FOUND", `Plan "${args.planId}" not found.`);
      }

      const rateCache = await getGoldRate();
      const appraisal = calculateAppraisal({
        netWeightGrams: args.netWeightGrams,
        karat: args.karat,
        maxLtvPercent: Number(plan.maxLtvPercent),
        rate24kPerGram: rateCache.rupees,
      });

      return {
        success: true,
        data: {
          pureGoldGrams: appraisal.pureGoldGrams,
          goldValuePaise: appraisal.goldValuePaise.toString(),
          eligibleLoanPaise: appraisal.eligibleLoanPaise.toString(),
          eligibleLoanRupees: Number(appraisal.eligibleLoanPaise / 100n),
          effectiveLtvPercent: appraisal.effectiveLtvPercent,
          rate24kPaise: appraisal.rate24kPaise.toString(),
          planName: plan.name,
        },
      };
    }

    case "get_lead_status": {
      const parsed = agentGetLeadStatusSchema.safeParse(rawArgs);
      if (!parsed.success) throw validationError(zodToFieldErrors(parsed.error));

      const lead = await prisma.lead.findFirst({
        where: {
          OR: [
            { applicationId: parsed.data.applicationId },
            { id: parsed.data.applicationId },
          ],
        },
        include: { plan: true },
        select: {
          applicationId: true,
          fullName: true,
          status: true,
          eligibleLoanPaise: true,
          createdAt: true,
          plan: { select: { name: true } },
        },
      });
      if (!lead) {
        throw new AppError("NOT_FOUND", `Application "${parsed.data.applicationId}" not found.`);
      }
      return { success: true, data: serialiseBigInt(lead) };
    }

    case "list_schemes": {
      const schemes = await prisma.loanScheme.findMany({
        where: { isActive: true },
        orderBy: { id: "asc" },
      });
      return { success: true, data: schemes };
    }

    default:
      throw new AppError("VALIDATION_ERROR", `Unknown tool: "${toolName}".`);
  }
}

// ── Chat endpoint ─────────────────────────────────────────────────────────────

agentRouter.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(zodToFieldErrors(parsed.error));
  }
  const { message, sessionId } = parsed.data;

  const provider = process.env["LLM_PROVIDER"] ?? "mock";
  const sid = sessionId ?? crypto.randomUUID();

  // Route to the appropriate LLM backend
  const llmResponse = await routeToLLM(provider, message, sid);

  return res.json({
    success: true,
    sessionId: sid,
    reply: llmResponse.reply,
    toolsUsed: llmResponse.toolsUsed,
  });
});

// ── LLM router ────────────────────────────────────────────────────────────────

interface LLMResponse {
  reply: string;
  toolsUsed: string[];
}

async function routeToLLM(
  provider: string,
  message: string,
  _sessionId: string
): Promise<LLMResponse> {
  switch (provider) {
    case "mock":
      return mockLLM(message);
    case "gemini":
      return geminiLLM(message);
    case "groq":
      return groqLLM(message);
    case "ollama":
      return ollamaLLM(message);
    default:
      return mockLLM(message);
  }
}

// ── Mock LLM — deterministic for tests ───────────────────────────────────────

async function mockLLM(message: string): Promise<LLMResponse> {
  const lower = message.toLowerCase();

  // Intent: check status
  if (lower.includes("status") || lower.match(/gl-\d+/i)) {
    const match = message.match(/gl-\d+/i);
    if (match) {
      try {
        const result = await executeTool("get_lead_status", {
          applicationId: match[0].toUpperCase(),
        });
        const d = result.data as {
          applicationId: string;
          status: string;
          eligibleLoanPaise: string;
        };
        return {
          reply: `Application ${d.applicationId} is currently **${d.status}**. Eligible loan amount: ₹${Math.floor(Number(d.eligibleLoanPaise) / 100).toLocaleString("en-IN")}.`,
          toolsUsed: ["get_lead_status"],
        };
      } catch {
        return {
          reply: `I couldn't find that application. Please check the application ID and try again.`,
          toolsUsed: ["get_lead_status"],
        };
      }
    }
  }

  // Intent: list plans
  if (lower.includes("plan") || lower.includes("scheme") || lower.includes("interest")) {
    const result = await executeTool("list_schemes", {});
    const schemes = result.data as Array<{
      id: string;
      name: string;
      interestRatePa: string;
      maxLtvPercent: string;
      tenureMonths: number;
      description: string;
    }>;
    const list = schemes
      .map(
        (s) =>
          `• **${s.name}** (${s.id}): ${s.interestRatePa}% p.a., max LTV ${s.maxLtvPercent}%, ${s.tenureMonths} months — ${s.description}`
      )
      .join("\n");
    return {
      reply: `Here are our available gold loan plans:\n\n${list}\n\nWhich plan would you like to apply for?`,
      toolsUsed: ["list_schemes"],
    };
  }

  // Intent: calculate loan
  if (lower.includes("how much") || lower.includes("eligible") || lower.includes("calculate")) {
    return {
      reply:
        "I can calculate your eligible loan amount! Please share: (1) net gold weight in grams, (2) gold purity (18k, 22k, or 24k), and (3) preferred plan (Bullet Repayment or Monthly EMI).",
      toolsUsed: [],
    };
  }

  // Intent: apply
  if (lower.includes("apply") || lower.includes("loan") || lower.includes("gold")) {
    return {
      reply:
        "I'd be happy to help you apply for a gold loan! Please provide: (1) your full name, (2) mobile number, (3) gross and net gold weight in grams, (4) gold purity (18k, 22k, or 24k), and (5) your preferred plan.",
      toolsUsed: [],
    };
  }

  return {
    reply:
      "Hello! I'm the TGlobal Gold Loan Assistant. I can help you apply for a loan, check your eligibility, view our plans, or check an existing application status. What would you like to do?",
    toolsUsed: [],
  };
}

// ── Gemini LLM stub ───────────────────────────────────────────────────────────

async function geminiLLM(message: string): Promise<LLMResponse> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) {
    console.warn("[Agent] GEMINI_API_KEY not set, falling back to mock");
    return mockLLM(message);
  }
  // Phase 2 stub — full Gemini tool-calling integration in Phase 3
  return mockLLM(message);
}

// ── Groq LLM stub ─────────────────────────────────────────────────────────────

async function groqLLM(message: string): Promise<LLMResponse> {
  const key = process.env["GROQ_API_KEY"];
  if (!key) {
    console.warn("[Agent] GROQ_API_KEY not set, falling back to mock");
    return mockLLM(message);
  }
  return mockLLM(message);
}

// ── Ollama LLM stub ───────────────────────────────────────────────────────────

async function ollamaLLM(message: string): Promise<LLMResponse> {
  const base = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
  try {
    const resp = await fetch(`${base}/api/tags`);
    if (!resp.ok) throw new Error("Ollama not reachable");
  } catch {
    console.warn("[Agent] Ollama not reachable at", base, ", falling back to mock");
    return mockLLM(message);
  }
  return mockLLM(message);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function serialiseBigInt(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

// Export for eval runner
export { executeTool };
