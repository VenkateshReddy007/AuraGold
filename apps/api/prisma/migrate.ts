/**
 * apps/api/prisma/migrate.ts
 *
 * Helper script to run migrations and seed in sequence.
 * Usage: tsx prisma/migrate.ts
 *
 * Equivalent to:
 *   npx prisma migrate deploy && tsx prisma/seed.ts
 */

import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function run(cmd: string) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

try {
  run("npx prisma migrate deploy");
  console.log("\n✅  Migrations applied");
  run("tsx prisma/seed.ts");
} catch (err) {
  console.error("\n❌  Migration/seed failed:", err);
  process.exit(1);
}
