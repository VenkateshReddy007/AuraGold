/**
 * apps/api/src/test/setup.ts
 *
 * Vitest setupFiles — runs once per worker before any test file.
 * Sets required environment variables only.
 *
 * NOTE: Do NOT call afterAll/beforeAll here — setupFiles does not support
 * lifecycle hooks in Vitest 2.x. Prisma disconnect is handled in the
 * individual test files via afterAll in helpers/app.ts.
 */

process.env["NODE_ENV"] = "test";
process.env["GOLD_RATE_24K_PAISE"] ??= "700000";
process.env["DATABASE_URL"] ??=
  "postgresql://postgres:postgres@localhost:5432/tglobal_gold_loan?schema=public";
process.env["PORT"] ??= "4000";
