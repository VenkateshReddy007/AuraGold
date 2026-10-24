import { Router, type Request, type Response, type NextFunction } from "express";
import { getActiveScheme, listActiveSchemes } from "../services/scheme.service.js";
import { notFound } from "../middleware/error.middleware.js";

export const schemesRouter = Router();

schemesRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const schemes = await listActiveSchemes();
    return res.json({ success: true, data: schemes });
  } catch (err) {
    return next(err);
  }
});

schemesRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params["id"];
    if (typeof id !== "string") return next(notFound("Scheme", ""));
    const scheme = await getActiveScheme(id);
    return res.json({ success: true, data: scheme });
  } catch (err) {
    return next(err);
  }
});
