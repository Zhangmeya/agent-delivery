// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@penclipai/shared";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockAccessApi = vi.hoisted(() => ({ listUserDirectory: vi.fn() }));
const mockAgentsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockGoalsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockInstanceSettingsApi = vi.hoisted(() => ({ getExperimental: vi.fn() }));
const mockSecretsApi = vi.hoisted(() => ({
  list: vi.fn(),
  listUserSecretDefinitions: vi.fn(),
  create: vi.fn(),
}));

vi.mock("../api/access", () => ({ accessApi: mockAccessApi }));
vi.mock("../api/agents", () => ({ agentsApi: mockAgentsApi }));
vi.mock("../api/goals", () => ({ goalsApi: mockGoalsApi }));
vi.mock("../api/instanceSettings", () => ({ instanceSettingsApi: mockInstanceSettingsApi }));
vi.mock("../api/secrets", () => ({ secretsApi: mockSecretsApi }));
vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));
vi.mock("@/lib/router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("./environment-variables-editor", () => ({
  EnvironmentVariablesEditor: () => null,
}));

beforeAll(() => {
  const prototype = window.CSSStyleSheet?.prototype as
    | (CSSStyleSheet & { __projectDeliveryPatched?: boolean })
    | undefined;
  if (!prototype || prototype.__projectDeliveryPatched) return;

  const originalInsertRule = prototype.insertRule;
  prototype.insertRule = function insertRule(rule: string, index?: number) {
    try {
      return originalInsertRule.call(this, rule, index);
    } catch {
      return originalInsertRule.call(this, ".project-delivery-noop{}", index);
    }
  };
  prototype.__projectDeliveryPatched = true;
});

function project(overrides: Partial<Project> = {}): Project {
  const now = new Date("2026-07-28T00:00:00Z");
  return {
    id: "project-1",
    companyId: "company-1",
    urlKey: "project-1",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Delivery Project",
    description: null,
    status: "planned",
    leadAgentId: null,
    deliveryMethod: "digital_twin_story",
    projectManagerUserId: "user-1",
    pmAgentId: "agent-1",
    finalAcceptanceOwnerUserId: "user-1",
    plannedStartDate: "2026-08-01",
    targetDate: "2026-12-31",
    color: null,
    icon: null,
    env: null,
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    codebase: {
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "/tmp/project-1",
      effectiveLocalFolder: "/tmp/project-1",
      origin: "managed_checkout",
    },
    workspaces: [],
    primaryWorkspace: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("ProjectProperties delivery configuration", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockAccessApi.listUserDirectory.mockResolvedValue({
      users: [
        {
          principalId: "user-1",
          status: "active",
          user: { id: "user-1", name: "张孟阳", email: "pm@example.com", image: null },
        },
      ],
    });
    mockAgentsApi.list.mockResolvedValue([
      { id: "agent-1", name: "PM Agent" },
      { id: "agent-2", name: "备用 PM Agent" },
    ]);
    mockGoalsApi.list.mockResolvedValue([]);
    mockInstanceSettingsApi.getExperimental.mockResolvedValue({
      enableEnvironments: false,
      enableIsolatedWorkspaces: false,
    });
    mockSecretsApi.list.mockResolvedValue([]);
    mockSecretsApi.listUserSecretDefinitions.mockResolvedValue([]);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container.remove();
    vi.clearAllMocks();
  });

  it("renders and updates delivery fields after project creation", async () => {
    const { ProjectProperties } = await import("./ProjectProperties");
    const { TooltipProvider } = await import("./ui/tooltip");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onFieldUpdate = vi.fn();

    await act(async () => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ProjectProperties project={project()} onFieldUpdate={onFieldUpdate} />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain("项目交付");
      expect(container.textContent).toContain("最终验收负责人");
      expect(container.textContent).toContain("张孟阳");
      expect(container.textContent).toContain("PM Agent");
    });

    const selects = Array.from(container.querySelectorAll("select"));
    const pmAgentSelect = selects.find((select) => select.textContent?.includes("备用 PM Agent"));
    const finalAcceptanceSelect = selects.find((select) => select.textContent?.includes("张孟阳"));
    const dateInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));

    expect(pmAgentSelect?.value).toBe("agent-1");
    expect(finalAcceptanceSelect?.value).toBe("user-1");
    expect(dateInputs.map((input) => input.value)).toEqual(["2026-08-01", "2026-12-31"]);

    await act(async () => {
      if (!finalAcceptanceSelect) throw new Error("Final acceptance owner select is missing");
      finalAcceptanceSelect.value = "";
      finalAcceptanceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onFieldUpdate).toHaveBeenCalledWith("final_acceptance_owner", {
      finalAcceptanceOwnerUserId: null,
    });
  }, 15_000);
});
