import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { router } from "./routes/index.js";
import { errorHandler, AppError } from "./middleware/error.middleware.js";

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  const allowedOrigins = (process.env["CORS_ORIGIN"] ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({
    origin(origin, callback) {
      // Permit server-to-server and local tooling requests without an Origin header.
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Idempotency-Key", "Authorization"],
    maxAge: 600,
  }));
  app.use(morgan(process.env["NODE_ENV"] === "production" ? "combined" : "dev"));
  // Appraisal slip images arrive base64-encoded in JSON (up to 12 MB).
  app.use(express.json({ limit: "16mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/v1", router);

  // 404 catch-all
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError("NOT_FOUND", "Route not found."));
  });

  // Global error handler (must be last, 4-arg signature)
  app.use(errorHandler);

  return app;
}
