/**
 * apps/api/src/routes/agent.ts
 * POST /api/v1/agent/chat  – single-turn AI agent conversation endpoint
 *
 * This is a stub that will be fleshed out in Phase 2 (AI agent implementation).
 */

import { Router } from "express";
import { z } from "zod";

export const agentRouter = Router();

const chatSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
});

agentRouter.post("/chat", async (req, res) => {
  const { message, sessionId } = chatSchema.parse(req.body);

  // Phase 2: wire in the LLM router + tool-calling loop
  return res.json({
    success: true,
    sessionId: sessionId ?? crypto.randomUUID(),
    reply: `[AI Agent stub] Received: "${message}". Full AI implementation coming in Phase 2.`,
  });
});
