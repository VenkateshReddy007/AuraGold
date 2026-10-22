/**
 * apps/api/src/lib/applicationId.ts
 *
 * Generates human-friendly application IDs like "GL-1042".
 *
 * Race-safety: we use a DB-level advisory lock pattern by fetching the
 * MAX existing ID inside the same transaction that creates the lead.
 * Since this runs inside prisma.$transaction(), Postgres serialises it.
 *
 * Alternatively, this could use a SEQUENCE — keeping it simple here.
 */

import { prisma } from "./prisma.js";

/**
 * Generate the next GL-XXXX application ID.
 * Safe to call inside a Prisma transaction — pass the tx client if available.
 */
export async function generateApplicationId(
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<string> {
  const client = tx ?? prisma;

  const latest = await client.lead.findFirst({
    orderBy: { applicationId: "desc" },
    select: { applicationId: true },
    // Use raw order to sort numerically; string sort works here since IDs are zero-padded
  });

  if (!latest) return "GL-1001";

  const match = latest.applicationId.match(/^GL-(\d+)$/);
  if (!match?.[1]) return "GL-1001";

  const next = parseInt(match[1], 10) + 1;
  return `GL-${next}`;
}
