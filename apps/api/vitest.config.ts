import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Unit tests — no DB required
    include: [
      "src/lib/**/*.test.ts",
      "src/services/**/*.test.ts",
      "src/schemas/**/*.test.ts",
      "src/middleware/**/*.test.ts",
    ],
    // Integration tests (require a running DB) live in src/**/*.integration.test.ts
    // and are excluded here — run them with: vitest run --include 'src/**/*.integration.test.ts'
    exclude: ["src/**/*.integration.test.ts", "src/eval/**"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["src/eval/**", "prisma/**", "dist/**"],
    },
  },
});
