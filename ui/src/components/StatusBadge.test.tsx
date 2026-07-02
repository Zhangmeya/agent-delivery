// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentStatusBadge, IssueStatusBadge, StatusBadge } from "./StatusBadge";
import { StatusGlyph } from "./StatusGlyph";
import { agentStatusVar, statusBadge, taskStatusVar } from "../lib/status-colors";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

/**
 * Issue/task status chips carry the unified glyph and are recolored from the
 * `--status-task-*` base hue via the `.status-chip` color-mix helper.
 */
describe("IssueStatusBadge", () => {
  it("wires each issue status to its --status-task-* base hue, with a glyph", () => {
    for (const [status, cssVar] of Object.entries(taskStatusVar)) {
      const html = renderToStaticMarkup(<IssueStatusBadge status={status} />);
      expect(html).toContain("status-chip");
      expect(html).toContain("border");
      expect(html).toContain(`var(${cssVar})`);
      expect(html).toContain('viewBox="0 0 24 24"');
    }
  });

  it("points in_progress at the blue liveness var and todo at the amber var", () => {
    expect(renderToStaticMarkup(<IssueStatusBadge status="in_progress" />)).toContain("var(--status-task-in_progress)");
    expect(renderToStaticMarkup(<IssueStatusBadge status="todo" />)).toContain("var(--status-task-todo)");
  });

  it("renders translated labels and regular weight", () => {
    const html = renderToStaticMarkup(<IssueStatusBadge status="in_review" />);
    expect(html).toContain("In Review");
    expect(html).toContain("font-normal");
    expect(html).not.toContain("font-medium");
  });

  it("strikes through cancelled chips", () => {
    expect(renderToStaticMarkup(<IssueStatusBadge status="cancelled" />)).toContain("line-through");
  });

  it("falls back to the backlog var for unknown statuses", () => {
    expect(renderToStaticMarkup(<IssueStatusBadge status="mystery" />)).toContain("var(--status-task-backlog)");
  });
});

/** Agent chips recolor from the `--status-agent-*` base hues. */
describe("AgentStatusBadge", () => {
  it("wires each agent status to its --status-agent-* base hue via status-chip", () => {
    for (const [status, cssVar] of Object.entries(agentStatusVar)) {
      const html = renderToStaticMarkup(<AgentStatusBadge status={status} />);
      expect(html).toContain("status-chip");
      expect(html).toContain(`var(${cssVar})`);
    }
  });

  it('renders "active" as the idle label', () => {
    expect(renderToStaticMarkup(<AgentStatusBadge status="active" />)).toContain("Idle");
  });

  it("renders agent status enums through shared status labels", () => {
    expect(renderToStaticMarkup(<AgentStatusBadge status="pending_approval" />)).toContain("Pending Approval");
  });
});

describe("StatusBadge", () => {
  it("uses the generic status badge palette and translated status labels", () => {
    expect(renderToStaticMarkup(<StatusBadge status="todo" />)).toContain(statusBadge.todo.split(" ")[0]);
    expect(renderToStaticMarkup(<StatusBadge status="todo" />)).toContain("Todo");
    expect(renderToStaticMarkup(<StatusBadge status="in_progress" />)).toContain(statusBadge.in_progress.split(" ")[0]);
    expect(renderToStaticMarkup(<StatusBadge status="in_progress" />)).toContain("In Progress");
  });
});

describe("StatusGlyph", () => {
  it("gives in_progress a half-filled ring", () => {
    const html = renderToStaticMarkup(<StatusGlyph status="in_progress" />);
    expect(html).toContain('d="M12 3.5 A8.5 8.5 0 0 1 12 20.5 Z"');
  });

  it("gives in_review a ring + centre dot", () => {
    const html = renderToStaticMarkup(<StatusGlyph status="in_review" />);
    expect(html).toContain('r="3.6"');
  });

  it("gives done a filled circle with a knocked-out check", () => {
    const html = renderToStaticMarkup(<StatusGlyph status="done" />);
    expect(html).toContain('d="M7.5 12.2 10.6 15.2 16.5 8.8"');
    expect(html).toContain("stroke-background");
  });

  it("gives blocked a ring + bar", () => {
    const html = renderToStaticMarkup(<StatusGlyph status="blocked" />);
    expect(html).toContain("<rect");
  });

  it("gives backlog a dashed ring", () => {
    const html = renderToStaticMarkup(<StatusGlyph status="backlog" />);
    expect(html).toContain('stroke-dasharray="6.25 6.25"');
  });

  it("gives cancelled a ring + slash", () => {
    const html = renderToStaticMarkup(<StatusGlyph status="cancelled" />);
    expect(html).toContain('d="M6.5 17.5 17.5 6.5"');
  });
});
