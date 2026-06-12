import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Use a dedicated port so e2e tests always start their own server in local_trusted mode,
// even when the dev server is running on :3100 in authenticated mode.
const PORT = Number(process.env.PAPERCLIP_E2E_PORT ?? 3199);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PAPERCLIP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-e2e-home-"));
const PAPERCLIP_INSTANCE_ID = "playwright-e2e";
const PAPERCLIP_CONFIG = path.join(PAPERCLIP_HOME, "instances", PAPERCLIP_INSTANCE_ID, "config.json");
const PLAYWRIGHT_CHANNEL = process.env.PAPERCLIP_PLAYWRIGHT_CHANNEL?.trim();

function bootstrapE2EInstanceConfig(): void {
  const instanceRoot = path.join(PAPERCLIP_HOME, "instances", PAPERCLIP_INSTANCE_ID);
  fs.mkdirSync(instanceRoot, { recursive: true });
  const dataRoot = path.join(instanceRoot, "data");
  fs.writeFileSync(
    PAPERCLIP_CONFIG,
    `${JSON.stringify({
      $meta: { version: 1, updatedAt: "2026-01-01T00:00:00.000Z", source: "onboard" },
      database: {
        mode: "embedded-postgres",
        embeddedPostgresDataDir: path.join(instanceRoot, "db"),
        backup: {
          enabled: false,
          intervalMinutes: 60,
          retentionDays: 7,
          dir: path.join(dataRoot, "backups"),
        },
      },
      logging: { mode: "file", logDir: path.join(instanceRoot, "logs") },
      server: { deploymentMode: "local_trusted", host: "127.0.0.1", port: PORT },
      auth: { baseUrlMode: "auto" },
      storage: {
        provider: "local_disk",
        localDisk: { baseDir: path.join(dataRoot, "storage") },
      },
      secrets: {
        provider: "local_encrypted",
        strictMode: false,
        localEncrypted: { keyFilePath: path.join(instanceRoot, "secrets", "master.key") },
      },
    }, null, 2)}\n`,
    "utf8",
  );
}

bootstrapE2EInstanceConfig();

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  // These suites target dedicated multi-user configurations/ports and are
  // intentionally not part of the default local_trusted e2e run.
  testIgnore: ["multi-user.spec.ts", "multi-user-authenticated.spec.ts"],
  timeout: 60_000,
  retries: 0,
  // All specs share one throwaway server, and several toggle instance-level
  // state (the `enableConferenceRoomChat` experimental flag) that changes
  // which UI variant renders. Run files serially so a flag flip in one spec
  // can't change the wizard/thread under another spec mid-flight.
  workers: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...(PLAYWRIGHT_CHANNEL ? { channel: PLAYWRIGHT_CHANNEL } : {}),
      },
    },
  ],
  // The webServer directive starts `penclip run` before tests.
  // Expects `pnpm penclip` to be runnable from repo root.
  webServer: {
    command: `pnpm penclip run`,
    url: `${BASE_URL}/api/health`,
    // Always boot a dedicated throwaway instance for e2e so browser tests
    // never attach to the developer's active Paperclip home/server.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PORT: String(PORT),
      PAPERCLIP_HOME,
      PAPERCLIP_INSTANCE_ID,
      PAPERCLIP_CONFIG,
      PAPERCLIP_BIND: "loopback",
      PAPERCLIP_DEPLOYMENT_MODE: "local_trusted",
      PAPERCLIP_DEPLOYMENT_EXPOSURE: "private",
    },
  },
  outputDir: "./test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "./playwright-report" }]],
});
