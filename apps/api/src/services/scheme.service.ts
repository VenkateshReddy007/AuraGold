import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function listActiveSchemes() {
  return prisma.loanScheme.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });
}

export async function getActiveScheme(planId: string) {
  const scheme = await prisma.loanScheme.findFirst({
    where: { id: planId, isActive: true },
  });
  if (!scheme) throw new AppError("NOT_FOUND", `Loan plan "${planId}" not found or inactive.`);
  return scheme;
}
