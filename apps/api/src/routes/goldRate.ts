/**
 * apps/api/src/routes/goldRate.ts
 *
 * Bonus B1 – Cached Gold Rate Endpoint
 *
 * GET  /api/v1/gold-rate           – return current rate (from 5-min cache)
 * POST /api/v1/gold-rate/refresh   – force-refresh the cache (admin)
 */

import { Router } from "express";
import { getGoldRate, refreshGoldRate, formatRateResponse } from "../services/goldRate.service.js";

export const goldRateRouter = Router();

goldRateRouter.get("/", async (_req, res) => {
  const rate = await getGoldRate();
  return res.json({ success: true, data: formatRateResponse(rate) });
});

goldRateRouter.post("/refresh", async (_req, res) => {
  const rate = await refreshGoldRate();
  return res.json({ success: true, data: formatRateResponse(rate) });
});
