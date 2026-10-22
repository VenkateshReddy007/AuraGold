/**
 * apps/api/src/app.ts
 * Express application factory (separate from server bootstrap for testability).
 */

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { router } from "./routes/index.js";

export function createApp() {
  const app = express();

  // ── Security & logging middleware ────────────────────────────────────────
  app.use(helmet());
  app.use(cors());
  app.use(morgan(process.env["NODE_ENV"] === "production" ? "combined" : "dev"));
  app.use(express.json());

  // ── Health check ─────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── API routes ────────────────────────────────────────────────────────────
  app.use("/api/v1", router);

  // ── Global error handler ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const status =
      err instanceof Error && "statusCode" in err
        ? (err as Error & { statusCode: number }).statusCode
        : 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(status).json({ success: false, error: message });
  });

  return app;
}
