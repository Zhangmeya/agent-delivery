import { useMemo } from "react";
import {
  humanizeConnectionDisplayName,
  type Agent,
  type ToolCallEvent,
  type ToolConnectionLifecycleEvent,
} from "@penclipai/shared";
import { Link } from "@/lib/router";
import { Skeleton } from "@/components/ui/skeleton";
import { translateInstant } from "@/i18n";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";
import { appTabHref } from "../app-tabs";
import type { ActivityPanelProps } from "./types";

export function ActivityPanel(props: ActivityPanelProps) {
  return <RecentActivity {...props} />;
}

type TimelineRow = {
  key: string;
  createdAt: Date | string;
  primary: string;
  dotClass: string;
  /** Secondary "while working on PAP-…" issue link, tool-call rows only. */
  issue?: { identifier: string } | null;
  /** Deep-link rendered after the timestamp ("View in Setup"), lifecycle rows only. */
  link?: { to: string; label: string } | null;
};

function RecentActivity({
  events,
  lifecycleEvents,
  issues,
  actionRequests,
  loading,
  agents,
  connectionId,
  appName,
  userLabelById,
}: ActivityPanelProps) {
  const nameById = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

  const rows = useMemo<TimelineRow[]>(() => {
    const callRows: TimelineRow[] = events
      .filter((e) => HUMANIZED_EVENTS.has(e.eventType))
      .map((event) => {
        const row = humanizeEvent(
          event,
          nameById.get(event.agentId ?? "") ?? null,
          event.actionRequestId ? actionRequests[event.actionRequestId] : undefined,
          isTestEvent(event) ? resolveActorLabel(event.actorId, userLabelById) : null,
        );
        return {
          key: `call:${event.id}`,
          createdAt: event.createdAt,
          primary: row.primary,
          dotClass: dotColor(event),
          issue: event.issueId ? issues[event.issueId] ?? null : null,
        };
      });

    const setupHref = appTabHref(connectionId, "setup");
    const lifecycleRows: TimelineRow[] = lifecycleEvents.map((event) => ({
      key: `lifecycle:${event.id}`,
      createdAt: event.createdAt,
      primary: humanizeLifecycleEvent(event, appName, nameById.get(event.agentId ?? "") ?? null),
      dotClass: lifecycleDotColor(event),
      link: { to: setupHref, label: lifecycleLinkLabel(event) },
    }));

    return [...callRows, ...lifecycleRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [events, lifecycleEvents, issues, actionRequests, nameById, connectionId, appName, userLabelById]);

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-bold text-foreground">
          {translateInstant("apps.detail.activity.title", { defaultValue: "Recent activity" })}
        </h2>
      </div>
      {loading ? (
        <div className="space-y-2 py-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-5 text-sm text-muted-foreground">
          {translateInstant("apps.detail.activity.empty", { defaultValue: "No activity yet." })}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key} className="flex items-start gap-3 py-3 text-sm">
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", row.dotClass)} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-foreground">{row.primary}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.issue ? (
                    <>
                      {translateInstant("apps.detail.activity.whileWorkingOn", {
                        defaultValue: "while working on",
                      })}{" "}
                      <Link
                        to={`/issues/${row.issue.identifier}`}
                        className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {row.issue.identifier}
                      </Link>
                      {" · "}
                    </>
                  ) : null}
                  {timeAgo(row.createdAt)}
                  {row.link ? (
                    <>
                      {" · "}
                      <Link
                        to={row.link.to}
                        className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {row.link.label}
                      </Link>
                    </>
                  ) : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const HUMANIZED_EVENTS = new Set<ToolCallEvent["eventType"]>([
  "call_completed",
  "call_failed",
  "call_denied",
  "approval_requested",
  "approval_resolved",
]);

/**
 * A row is a prosumer Test-tab call (vs. a real heartbeat-driven agent run) when
 * the gateway tagged the audit event `metadata.source === "test"` (PAP-11349).
 */
export function isTestEvent(event: ToolCallEvent): boolean {
  return (event.metadata as { source?: unknown } | null)?.source === "test";
}

/** Display name for the human who ran a Test-tab call, from the company directory. */
export function resolveActorLabel(
  actorId: string | null,
  userLabelById: Map<string, string> | undefined,
): string {
  if (actorId) {
    const label = userLabelById?.get(actorId);
    if (label) return label;
    if (actorId === "local-board") {
      return translateInstant("apps.detail.activity.actor.board", { defaultValue: "Board" });
    }
  }
  return translateInstant("apps.detail.activity.actor.someone", { defaultValue: "Someone" });
}

export function humanizeEvent(
  event: ToolCallEvent,
  agentName: string | null,
  actionRequest?: ActivityPanelProps["actionRequests"][string],
  /** When set, this row is a Test-tab call run by the named user; prefix accordingly. */
  testRunnerLabel?: string | null,
): { primary: string } {
  // For Test-tab calls, surface "<User> tested as <Agent>" so prosumer test runs are
  // distinguishable from real heartbeat agent activity in the audit trail (PAP-11415).
  const who = testRunnerLabel
    ? translateInstant("apps.detail.activity.event.testedAs", {
      defaultValue: "{{runner}} tested as {{agentName}}",
      runner: testRunnerLabel,
      agentName: agentName
        ?? translateInstant("apps.detail.activity.actor.anAgentLower", { defaultValue: "an agent" }),
    })
    : agentName ?? translateInstant("apps.detail.activity.actor.anAgent", { defaultValue: "An agent" });
  // The raw gateway tool name is prefixed (e.g. `mcp.app-gallery-link-…:kv-set`);
  // humanize it to "Kv Set" to match the cross-app Activity view (PAP-11105).
  const action = event.toolName
    ? humanizeConnectionDisplayName(event.toolName)
    : translateInstant("apps.detail.activity.event.anAction", { defaultValue: "an action" });
  switch (event.eventType) {
    case "call_completed":
      return {
        primary: event.outcome === "success"
          ? translateInstant("apps.detail.activity.event.callCompleted", {
            defaultValue: "{{who}} used {{action}}",
            who,
            action,
          })
          : translateInstant("apps.detail.activity.event.callCompletedIncomplete", {
            defaultValue: "{{who}} ran {{action}}, but it didn't finish",
            who,
            action,
          }),
      };
    case "call_failed":
      return {
        primary: translateInstant("apps.detail.activity.event.callFailed", {
          defaultValue: "{{action}} didn't work for {{who}}",
          action,
          who: lower(who),
        }),
      };
    case "call_denied":
      return {
        primary: testRunnerLabel
          ? translateInstant("apps.detail.activity.event.callDeniedTest", {
            defaultValue: "{{who}} - {{action}} is turned off",
            who,
            action,
          })
          : translateInstant("apps.detail.activity.event.callDenied", {
            defaultValue: "Blocked {{action}} - it isn't turned on",
            action,
          }),
      };
    case "approval_requested":
      return {
        primary: translateInstant("apps.detail.activity.event.approvalRequested", {
          defaultValue: "{{who}} asked before running {{action}}",
          who,
          action,
        }),
      };
    case "approval_resolved":
      return { primary: humanizeApprovalResolved(action, actionRequest) };
    default:
      return {
        primary: translateInstant("apps.detail.activity.event.default", {
          defaultValue: "{{who}} used {{action}}",
          who,
          action,
        }),
      };
  }
}

function humanizeApprovalResolved(
  action: string,
  actionRequest?: ActivityPanelProps["actionRequests"][string],
): string {
  const resolver = actionRequest?.resolverDisplayName
    ?? translateInstant("apps.detail.activity.actor.someone", { defaultValue: "Someone" });
  if (actionRequest?.status === "approved") {
    return translateInstant("apps.detail.activity.event.approvalResolved.approved", {
      defaultValue: "{{resolver}} approved {{action}}",
      resolver,
      action,
    });
  }
  if (actionRequest?.status === "rejected") {
    return translateInstant("apps.detail.activity.event.approvalResolved.rejected", {
      defaultValue: "{{resolver}} said no to {{action}}",
      resolver,
      action,
    });
  }
  return translateInstant("apps.detail.activity.event.approvalResolved.reviewed", {
    defaultValue: "{{resolver}} reviewed {{action}}",
    resolver,
    action,
  });
}

/** Humanize a connection lifecycle event into a prosumer sentence (PAP-11284). */
function humanizeLifecycleEvent(
  event: ToolConnectionLifecycleEvent,
  appName: string,
  agentName: string | null,
): string {
  const who = event.actorDisplayName
    ?? agentName
    ?? translateInstant("apps.detail.activity.actor.someone", { defaultValue: "Someone" });
  switch (event.type) {
    case "app_connected":
      return translateInstant("apps.detail.activity.lifecycle.connected", {
        defaultValue: "{{who}} connected {{appName}}",
        who,
        appName,
      });
    case "app_paused":
      return translateInstant("apps.detail.activity.lifecycle.paused", {
        defaultValue: "{{who}} paused this app",
        who,
      });
    case "app_resumed":
      return translateInstant("apps.detail.activity.lifecycle.resumed", {
        defaultValue: "{{who}} resumed this app",
        who,
      });
    case "reconnected":
      return translateInstant("apps.detail.activity.lifecycle.reconnected", {
        defaultValue: "{{who}} reconnected {{appName}}",
        who,
        appName,
      });
    case "disconnected":
      return translateInstant("apps.detail.activity.lifecycle.disconnected", {
        defaultValue: "{{who}} disconnected {{appName}}",
        who,
        appName,
      });
    case "allowlist_changed":
      return humanizeAllowlistChange(who, event.details);
    case "actions_quarantined": {
      const count = numberFrom(event.details?.count);
      return translateInstant("apps.detail.activity.lifecycle.actionsQuarantined", {
        defaultValue: `${count} new ${count === 1 ? "action" : "actions"} need review`,
        count,
      });
    }
    default:
      return translateInstant("apps.detail.activity.lifecycle.updated", {
        defaultValue: "{{who}} updated this app",
        who,
      });
  }
}

function humanizeAllowlistChange(who: string, details: Record<string, unknown> | null): string {
  const added = numberFrom(details?.added);
  const removed = numberFrom(details?.removed);
  if (added > 0 && removed === 0) {
    return translateInstant("apps.detail.activity.allowlist.added", {
      defaultValue: "{{who}} added {{count}} {{noun}} to the allowlist",
      who,
      count: added,
      noun: added === 1
        ? translateInstant("apps.detail.activity.allowlist.sheet", { defaultValue: "sheet" })
        : translateInstant("apps.detail.activity.allowlist.sheets", { defaultValue: "sheets" }),
    });
  }
  if (removed > 0 && added === 0) {
    return translateInstant("apps.detail.activity.allowlist.removed", {
      defaultValue: "{{who}} removed {{count}} {{noun}} from the allowlist",
      who,
      count: removed,
      noun: removed === 1
        ? translateInstant("apps.detail.activity.allowlist.sheet", { defaultValue: "sheet" })
        : translateInstant("apps.detail.activity.allowlist.sheets", { defaultValue: "sheets" }),
    });
  }
  if (added > 0 && removed > 0) {
    return translateInstant("apps.detail.activity.allowlist.updatedCounts", {
      defaultValue: "{{who}} updated the allowlist (added {{added}}, removed {{removed}})",
      who,
      added,
      removed,
    });
  }
  return translateInstant("apps.detail.activity.allowlist.updated", {
    defaultValue: "{{who}} updated the allowlist",
    who,
  });
}

function lifecycleLinkLabel(event: ToolConnectionLifecycleEvent): string {
  return event.type === "actions_quarantined"
    ? translateInstant("apps.detail.activity.link.reviewInSetup", { defaultValue: "Review in Setup" })
    : translateInstant("apps.detail.activity.link.viewInSetup", { defaultValue: "View in Setup" });
}

function numberFrom(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function lower(who: string): string {
  return who === translateInstant("apps.detail.activity.actor.anAgent", { defaultValue: "An agent" })
    ? translateInstant("apps.detail.activity.actor.anAgentLower", { defaultValue: "an agent" })
    : who;
}

function dotColor(event: ToolCallEvent): string {
  if (event.eventType === "call_failed" || event.outcome === "failure" || event.outcome === "timeout") {
    return "bg-red-400";
  }
  if (event.eventType === "call_denied" || event.outcome === "denied") return "bg-amber-400";
  if (event.eventType === "approval_requested") return "bg-amber-400";
  return "bg-emerald-400";
}

function lifecycleDotColor(event: ToolConnectionLifecycleEvent): string {
  if (event.type === "disconnected") return "bg-red-400";
  if (event.type === "app_paused" || event.type === "actions_quarantined") return "bg-amber-400";
  return "bg-emerald-400";
}
