/**
 * apps/api/src/routes/index.ts
 * Aggregates all versioned API routers.
 */

import { Router } from "express";
import { leadsRouter } from "./leads.js";
import { schemesRouter } from "./schemes.js";
import { quotesRouter } from "./quotes.js";
import { agentRoutes } from "./agent.routes.js";
import { goldRateRouter } from "./goldRate.js";

export const router = Router();

router.use("/leads",       leadsRouter);
router.use("/schemes",     schemesRouter);
router.use("/loan-schemes", schemesRouter);   // alias used by brief
router.use("/quotes",      quotesRouter);
router.use("/agent",       agentRoutes);
router.use("/gold-rate",   goldRateRouter);
