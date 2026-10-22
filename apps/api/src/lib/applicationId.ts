/**
 * apps/api/src/lib/applicationId.ts
 *
 * Generates human-friendly application IDs like "GL-1042".
 * Finds the highest existing numeric suffix and increments by 1.
 * Starts at GL-1001 if no leads exist yet.
 */

import { prisma } from "./prisma.js";

export async function generateApplicationId(): Promise<string> {
  const latest = await prisma.lead.findFirst({
    orderBy: { createdAt: "desc" },
    select: { applicationId: true },
  });

  if (!latest) return "GL-1001";

  const match = latest.applicationId.match(/^GL-(\d+)$/);
  if (!match || !match[1]) return "GL-1001";

  const next = parseInt(match[1], 10) + 1;
  return `GL-${next}`;
}
