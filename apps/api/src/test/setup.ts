/**
 * apps/api/src/test/setup.ts
 * Global Vitest setup — runs before every test file.
 *
 * Only sets env variables. Does NOT import any module that touches
 * the database, Prisma client, or network.
 */

// Set required env vars for tests that don't need a real DB
process.env["NODE_ENV"] = "test";
process.env["GOLD_RATE_24K_PAISE"] ??= "700000";
process.env["DATABASE_URL"] ??=
  "postgresql://postgres:postgres@localhost:5432/tglobal_gold_loan?schema=public";
process.env["PORT"] ??= "4000";
