/**
 * apps/api/src/routes/index.ts
 * Aggregates all versioned API routers.
 */

import { Router } from "express";
import { leadsRouter } from "./leads.js";
import { schemesRouter } from "./schemes.js";
import { agentRouter } from "./agent.js";

export const router = Router();

router.use("/leads", leadsRouter);
router.use("/schemes", schemesRouter);
router.use("/agent", agentRouter);
