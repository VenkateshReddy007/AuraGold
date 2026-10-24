/**
 * tests/globalSetup.ts
 *
 * Vitest globalSetup — runs once in the main process (not in workers).
 * Responsible for tearing down the DB connection pool after all tests finish,
 * so Vitest can exit cleanly.
 */

import { PrismaClient } from "@prisma/client";

// Main-process Prisma client used solely for globalSetup/teardown.
// Worker-level clients are handled by src/lib/prisma.ts.
const prisma = new PrismaClient({ log: [] });

export async function setup(): Promise<void> {
  // Verify DB is reachable before any test runs
  await prisma.$connect();
  console.log("\n[globalSetup] Connected to PostgreSQL ✓\n");
}

export async function teardown(): Promise<void> {
  await prisma.$disconnect();
  console.log("\n[globalSetup] Disconnected from PostgreSQL ✓\n");
}
