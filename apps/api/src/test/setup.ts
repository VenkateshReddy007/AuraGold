/**
 * apps/api/src/test/setup.ts
 * Global Vitest setup – runs before every test file.
 */

import { config } from "dotenv";

// Load test env variables (falls back to .env.example defaults if no .env present)
config({ path: ".env.example" });

// Ensure a mock-safe gold rate is always present in tests
if (!process.env["GOLD_RATE_24K_PAISE"]) {
  process.env["GOLD_RATE_24K_PAISE"] = "700000";
}
