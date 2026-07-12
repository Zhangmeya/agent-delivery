// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Issue } from "@penclipai/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockIssuesApiGet = vi.hoisted(() => vi.fn());

vi.mock("@/api/issues", () => ({
  issuesApi: {
    get: mockIssuesApiGet,
  },
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const fallback = typeof options?.defaultValue === "string" ? options.defaultValue : key;
        return fallback.replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
          String(options?.[token] ?? ""),
        );
      },
    }),
  };
});

vi.mock("@/components/ui/popover", () => {
  let isOpen = false;
  return {
    Popover: ({ open, children }: { open?: boolean; children: ReactNode }) => {
      isOpen = Boolean(open);
      return <>{children}</>;
    },
    PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    PopoverContent: ({ children }: { children: ReactNode }) =>
      isOpen ? <div>{children}</div> : null,
  };
});

import { IssueLinkQuicklook } from "./IssueLinkQuicklook";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function createIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "PAP-1",
    companyId: "company-1",
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Quicklook title",
    description: "Quicklook description",
    status: "todo",
    priority: "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    responsibleUserId: null,
    createdByAgentId: null,
    createdByUserId: null,
    issueNumber: 1,
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    labels: [],
    labelIds: [],
    myLastTouchAt: null,
    lastExternalCommentAt: null,
    isUnreadForMe: false,
    workMode: "standard",
    ...overrides,
  };
}

describe("IssueLinkQuicklook", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    mockIssuesApiGet.mockResolvedValue(createIssue());
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps portaled quicklook links mounted until after blur click handling", async () => {
    const issue = createIssue();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <IssueLinkQuicklook
              issuePathId="PAP-1"
              issuePrefetch={issue}
              to="/companies/company-1/issues/PAP-1"
            >
              PAP-1
            </IssueLinkQuicklook>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const trigger = container.querySelector("a") as HTMLAnchorElement | null;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.focus();
    });

    expect(document.body.textContent).toContain("Quicklook title");

    vi.useFakeTimers();

    act(() => {
      trigger?.blur();
    });

    expect(document.body.textContent).toContain("Quicklook title");

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(document.body.textContent).not.toContain("Quicklook title");
  });
});
