import { Router, type Request, type Response, type NextFunction } from "express";
import { calculateQuote } from "../services/quote.service.js";

export const quotesRouter = Router();

quotesRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quotes = await calculateQuote(req.body);
    return res.json({ success: true, data: quotes[0] });
  } catch (err) {
    return next(err);
  }
});
