import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "src/lib/**/*.test.ts",
      "src/services/**/*.test.ts",
      "src/schemas/**/*.test.ts",
      "src/middleware/**/*.test.ts",
    ],
    exclude: ["src/eval/**"],
    setupFiles: ["src/test/setup.ts"],
    // vmThreads: single-process V8 VM contexts — works with ESM + Node 24 on Windows
    pool: "vmThreads",
    poolOptions: {
      vmThreads: {
        // Use a single VM context so Prisma's native engine initialises once
        useAtomics: false,
      },
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["src/eval/**", "prisma/**", "dist/**"],
    },
  },
});
