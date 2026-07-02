import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["../packages/db/src/test-embedded-postgres-global-setup.ts"],
    testTimeout: process.platform === "win32" ? 10_000 : 5_000,
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
    isolate: true,
    maxConcurrency: 1,
    maxWorkers: 1,
    minWorkers: 1,
    pool: "forks",
    sequence: {
      concurrent: false,
      hooks: "list",
    },
    setupFiles: ["./src/__tests__/setup-supertest.ts"],
  },
});
