import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    fileParallelism: process.platform !== "win32",
    maxWorkers: process.platform === "win32" ? 1 : undefined,
  },
});
