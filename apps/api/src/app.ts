/**
 * apps/api/src/app.ts
 * Express application factory — separate from server bootstrap for testability.
 */

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { router } from "./routes/index.js";
import { errorHandler, AppError } from "./middleware/error.middleware.js";

export function createApp() {
  const app = express();

  // ── Security & logging ───────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors());
  app.use(
    morgan(process.env["NODE_ENV"] === "production" ? "combined" : "dev")
  );
  app.use(express.json());

  // ── Health check ─────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── API routes ────────────────────────────────────────────────────────────
  app.use("/api/v1", router);

  // ── 404 catch-all ────────────────────────────────────────────────────────
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError("NOT_FOUND", "Route not found."));
  });

  // ── Global error handler (must be last, 4-arg signature) ─────────────────
  app.use(errorHandler);

  return app;
}
