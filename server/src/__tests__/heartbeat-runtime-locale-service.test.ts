import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  agentWakeupRequests,
  companies,
  createDb,
  heartbeatRunEvents,
  heartbeatRuns,
  instanceSettings,
} from "@penclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { heartbeatService } from "../services/heartbeat.ts";
import { instanceSettingsService } from "../services/instance-settings.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres heartbeat runtime-locale tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("heartbeat runtime locale", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("heartbeat-runtime-locale-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(heartbeatRunEvents);
    await db.delete(heartbeatRuns);
    await db.delete(agentWakeupRequests);
    await db.delete(agents);
    await db.delete(companies);
    await db.delete(instanceSettings);
  });

  afterAll(async () => {
    await db?.$client?.end?.({ timeout: 0 });
    await tempDb?.cleanup();
  });

  async function insertAgent(status: "idle" | "running" = "idle") {
    const companyId = randomUUID();
    const agentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Runtime Locale Co",
      status: "active",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Runtime Agent",
      role: "engineer",
      status,
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {
        heartbeat: {
          enabled: true,
          intervalSec: 60,
          maxConcurrentRuns: 1,
          wakeOnDemand: true,
        },
      },
      permissions: {},
    });

    return { companyId, agentId };
  }

  async function getRunContext(runId: string) {
    const run = await db
      .select()
      .from(heartbeatRuns)
      .then((rows) => rows.find((candidate) => candidate.id === runId) ?? null);
    expect(run).toBeTruthy();
    return (run!.contextSnapshot ?? {}) as Record<string, unknown>;
  }

  it("materializes the instance runtime default locale onto neutral wakeups", async () => {
    const { companyId, agentId } = await insertAgent();
    const existingRunId = randomUUID();
    await instanceSettingsService(db).updateGeneral({ runtimeDefaultLocale: "zh-CN" });
    await db.insert(heartbeatRuns).values({
      id: existingRunId,
      companyId,
      agentId,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "queued",
      contextSnapshot: { taskKey: "task-1" },
    });

    const run = await heartbeatService(db).wakeup(agentId, {
      contextSnapshot: { taskKey: "task-1" },
      source: "on_demand",
      triggerDetail: "manual",
    });

    expect(run?.id).toBe(existingRunId);
    const context = await getRunContext(existingRunId);
    expect(context.runtimeUiLocale).toBe("zh-CN");
    expect(context).not.toHaveProperty("requestedUiLocale");
  });

  it("lets an explicit request locale override the instance default before persistence", async () => {
    const { companyId, agentId } = await insertAgent();
    const existingRunId = randomUUID();
    await instanceSettingsService(db).updateGeneral({ runtimeDefaultLocale: "zh-CN" });
    await db.insert(heartbeatRuns).values({
      id: existingRunId,
      companyId,
      agentId,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "queued",
      contextSnapshot: { taskKey: "task-2" },
    });

    const run = await heartbeatService(db).wakeup(agentId, {
      contextSnapshot: { taskKey: "task-2", requestedUiLocale: "en" },
      source: "on_demand",
      triggerDetail: "manual",
    });

    expect(run?.id).toBe(existingRunId);
    const context = await getRunContext(existingRunId);
    expect(context.runtimeUiLocale).toBe("en");
    expect(context).not.toHaveProperty("requestedUiLocale");
  });

  it("does not coalesce a different runtime locale into a running run", async () => {
    const { companyId, agentId } = await insertAgent("running");
    const runningRunId = randomUUID();
    await instanceSettingsService(db).updateGeneral({ runtimeDefaultLocale: "zh-CN" });
    await db.insert(heartbeatRuns).values({
      id: runningRunId,
      companyId,
      agentId,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "running",
      contextSnapshot: {
        taskKey: "task-3",
        runtimeUiLocale: "zh-CN",
      },
    });

    const run = await heartbeatService(db).wakeup(agentId, {
      contextSnapshot: { taskKey: "task-3", requestedUiLocale: "en" },
      source: "on_demand",
      triggerDetail: "manual",
    });

    expect(run?.id).not.toBe(runningRunId);
    const newContext = await getRunContext(run!.id);
    expect(newContext.runtimeUiLocale).toBe("en");
    expect(newContext).not.toHaveProperty("requestedUiLocale");
    const runningContext = await getRunContext(runningRunId);
    expect(runningContext.runtimeUiLocale).toBe("zh-CN");
  });
});
