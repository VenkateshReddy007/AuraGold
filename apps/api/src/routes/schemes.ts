/**
 * apps/api/src/routes/schemes.ts
 * GET /api/v1/schemes  – list all active loan schemes
 * GET /api/v1/schemes/:id
 */

import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const schemesRouter = Router();

schemesRouter.get("/", async (_req, res) => {
  const schemes = await prisma.loanScheme.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });
  return res.json({ success: true, data: schemes });
});

schemesRouter.get("/:id", async (req, res) => {
  const scheme = await prisma.loanScheme.findUnique({
    where: { id: req.params["id"] },
  });
  if (!scheme) {
    return res.status(404).json({ success: false, error: "Scheme not found." });
  }
  return res.json({ success: true, data: scheme });
});
