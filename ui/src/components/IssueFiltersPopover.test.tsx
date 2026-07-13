// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IssueFiltersPopover } from "./IssueFiltersPopover";
import { defaultIssueFilterState } from "../lib/issue-filters";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const translations: Record<string, string> = {
  Status: "状态",
  Priority: "优先级",
  "issueChat.assigneePlaceholder": "负责人",
  "issueChat.noAssignee": "无负责人",
  Me: "我",
  Creator: "创建者",
  "Remove creator {{name}}": "移除创建者 {{name}}",
  "Search creators...": "搜索创建者...",
  "No creators match.": "没有匹配的创建者。",
  Project: "项目",
  Labels: "标签",
  Workspace: "工作区",
  "projectWorkspace.visibility": "可见性",
  "Hide routine runs": "隐藏例行运行",
};

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const template = translations[key] ?? (typeof options?.defaultValue === "string" ? options.defaultValue : key);
        return template.replace(/\{\{(\w+)\}\}/g, (_match, token) => String(options?.[token] ?? ""));
      },
    }),
  };
});

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="popover-content" className={className}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked }: { checked?: boolean }) => <input type="checkbox" checked={checked} readOnly />,
}));

vi.mock("./StatusIcon", () => ({
  StatusIcon: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock("./PriorityIcon", () => ({
  PriorityIcon: ({ priority }: { priority: string }) => <span>{priority}</span>,
}));

describe("IssueFiltersPopover", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("uses a scrollable popover and a three-column desktop grid", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <IssueFiltersPopover
          state={defaultIssueFilterState}
          onChange={vi.fn()}
          activeFilterCount={0}
          agents={[{ id: "agent-1", name: "Agent One" }]}
          projects={[{ id: "project-1", name: "Project One" }]}
          labels={[{ id: "label-1", name: "Bug", color: "#ff0000" }]}
          workspaces={[{ id: "workspace-1", name: "Workspace One" }]}
          enableRoutineVisibilityFilter
        />,
      );
    });

    const renderedHtml = document.body.innerHTML;
    expect(renderedHtml).toContain("overflow-y-auto");
    expect(renderedHtml).toContain("max-h-(--sz-calc-9)");
    expect(renderedHtml).toContain("md:grid-cols-3");
    expect(renderedHtml).toContain("grid-cols-1");

    const popoverContent = container.querySelector("[data-testid='popover-content']");
    expect(popoverContent).not.toBeNull();
    const layoutGrid = Array.from(popoverContent?.querySelectorAll("div") ?? []).find((element) =>
      element.className.includes("md:grid-cols-3"),
    );
    expect(layoutGrid?.className).toContain("grid-cols-1");
    expect(popoverContent?.textContent).toContain("Live runs only");
  });

  it("localizes filter labels and creator search copy", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <IssueFiltersPopover
          state={{ ...defaultIssueFilterState, creators: ["user:chen"], hideRoutineExecutions: true }}
          onChange={vi.fn()}
          activeFilterCount={1}
          agents={[{ id: "agent-1", name: "Agent One" }]}
          projects={[{ id: "project-1", name: "Project One" }]}
          labels={[{ id: "label-1", name: "Bug", color: "#ff0000" }]}
          currentUserId="user:me"
          workspaces={[{ id: "workspace-1", name: "Workspace One" }]}
          creators={[{ id: "user:chen", label: "Chen", kind: "user" }]}
          enableRoutineVisibilityFilter
        />,
      );
    });

    const renderedHtml = document.body.innerHTML;
    expect(renderedHtml).toContain("状态");
    expect(renderedHtml).toContain("优先级");
    expect(renderedHtml).toContain("负责人");
    expect(renderedHtml).toContain("无负责人");
    expect(renderedHtml).toContain("我");
    expect(renderedHtml).toContain("创建者");
    expect(renderedHtml).toContain("placeholder=\"搜索创建者...\"");
    expect(renderedHtml).toContain("aria-label=\"移除创建者 Chen\"");
    expect(renderedHtml).toContain("项目");
    expect(renderedHtml).toContain("标签");
    expect(renderedHtml).toContain("工作区");
    expect(renderedHtml).toContain("可见性");
    expect(renderedHtml).toContain("隐藏例行运行");
  });
});
