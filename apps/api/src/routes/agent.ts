import { randomUUID } from "node:crypto";
import { agentRoutes } from "./agent.routes.js";
import { executeAgentTool } from "../agent/tools.js";

/**
 * Compatibility exports for callers that used the original agent route module.
 * The mounted router and all tool execution now use the shared Phase 4 agent.
 */
export const agentRouter = agentRoutes;

export async function executeTool(toolName: string, args: unknown) {
  const result = await executeAgentTool(toolName, args, { sessionId: randomUUID() });
  if ("error" in result && result.error) {
    throw Object.assign(new Error(result.error.message), {
      code: result.error.code,
      fields: result.error.fields,
    });
  }
  return result;
}
