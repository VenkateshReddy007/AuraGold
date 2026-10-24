import { Router, type NextFunction, type Request, type Response } from "express";
import { getGoldRate, refreshGoldRate, formatRateResponse } from "../services/goldRate.service.js";

export const goldRateRouter = Router();

goldRateRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rate = await getGoldRate();
    return res.json({ success: true, data: formatRateResponse(rate) });
  } catch (err) { return next(err); }
});

goldRateRouter.post("/refresh", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rate = await refreshGoldRate();
    return res.json({ success: true, data: formatRateResponse(rate) });
  } catch (err) { return next(err); }
});
