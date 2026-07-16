import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import { Link } from "@/lib/router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
import {
  toolsApi,
  type ToolAuditOutcome,
  type ToolAuditWindow,
  type ToolGatewayActivityEvent,
} from "@/api/tools";
import { agentsApi } from "@/api/agents";
import { ToolsPageHeader, LoadingState, ErrorState, RelativeTime } from "./shared";
import { advancedTabHref } from "./tool-tabs";

const PAGE_SIZE = 50;
const ALL = "__all";

/** Outcome chip vocabulary (spec §4C / §5): Allowed · Blocked · Asked first · Failed · Waiting. */
const OUTCOME_META: Record<ToolAuditOutcome, { key: string; defaultValue: string; status: string }> = {
  allowed: { key: "tools.audit.outcomes.allowed", defaultValue: "Allowed", status: "allowed" },
  blocked: { key: "tools.audit.outcomes.blocked", defaultValue: "Blocked", status: "denied" },
  asked_first: {
    key: "tools.audit.outcomes.askedFirst",
    defaultValue: "Asked first",
    status: "require-approval",
  },
  waiting: { key: "tools.audit.outcomes.waiting", defaultValue: "Waiting", status: "deferred" },
  failed: { key: "tools.audit.outcomes.failed", defaultValue: "Failed", status: "failed" },
  unknown: { key: "tools.audit.outcomes.recorded", defaultValue: "Recorded", status: "unchecked" },
};

const OUTCOME_FILTERS: { value: string; key: string; defaultValue: string }[] = [
  { value: ALL, key: "tools.audit.filters.allOutcomes", defaultValue: "All outcomes" },
  { value: "allowed", key: "tools.audit.outcomes.allowed", defaultValue: "Allowed" },
  { value: "blocked", key: "tools.audit.outcomes.blocked", defaultValue: "Blocked" },
  { value: "asked_first", key: "tools.audit.outcomes.askedFirst", defaultValue: "Asked first" },
  { value: "waiting", key: "tools.audit.outcomes.waiting", defaultValue: "Waiting" },
  { value: "failed", key: "tools.audit.outcomes.failed", defaultValue: "Failed" },
];

const WINDOW_FILTERS: { value: ToolAuditWindow; key: string; defaultValue: string }[] = [
  { value: "1h", key: "tools.audit.filters.lastHour", defaultValue: "Last 1 hour" },
  { value: "24h", key: "tools.audit.filters.last24Hours", defaultValue: "Last 24 hours" },
  { value: "7d", key: "tools.audit.filters.last7Days", defaultValue: "Last 7 days" },
  { value: "30d", key: "tools.audit.filters.last30Days", defaultValue: "Last 30 days" },
];

function detailString(details: Record<string, unknown> | null, key: string): string | undefined {
  const v = details?.[key];
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

function detailStringArray(details: Record<string, unknown> | null, key: string): string[] {
  const v = details?.[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function detailRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function detailNumber(details: Record<string, unknown> | null, key: string): number | undefined {
  const value = details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formattedArguments(details: Record<string, unknown> | null): string | undefined {
  const summary = detailRecord(details?.argumentsSummary);
  const serialized = typeof summary?.summary === "string" ? summary.summary : undefined;
  if (!serialized) return undefined;
  try {
    return JSON.stringify(JSON.parse(serialized), null, 2);
  } catch {
    return serialized;
  }
}

/** Plain-words "why" for the row expander, keyed off the reason code. */
function plainReason(event: ToolGatewayActivityEvent, t: TFunction): string {
  const code = detailString(event.details, "reasonCode");
  if (code === "permitted_connections_not_installed") {
    return t("tools.audit.reasons.notInstalled", {
      defaultValue: "Permitted connections were not installed, so their tools were not added to this run.",
    });
  }
  switch (event.normalizedOutcome) {
    case "allowed":
      return t("tools.audit.reasons.allowed", { defaultValue: "Allowed by your rules." });
    case "blocked":
      if (code === "rate_limited") {
        return t("tools.audit.reasons.rateLimited", {
          defaultValue: "Blocked because it ran too many times in a short window.",
        });
      }
      if (code?.includes("secret")) {
        return t("tools.audit.reasons.secretBlocked", {
          defaultValue: "Blocked to keep a sensitive value from leaving.",
        });
      }
      return t("tools.audit.reasons.blocked", { defaultValue: "Blocked by a rule." });
    case "asked_first":
      return t("tools.audit.reasons.askedFirst", {
        defaultValue: "Held for someone to approve before it could run.",
      });
    case "waiting":
      return t("tools.audit.reasons.waiting", {
        defaultValue: "Waiting — the app it needs wasn't ready yet.",
      });
    case "failed":
      return t("tools.audit.reasons.failed", {
        defaultValue: "The app was allowed to run it, but returned an error.",
      });
    default:
      return t("tools.audit.reasons.recorded", { defaultValue: "Recorded by Paperclip." });
  }
}

/** Compact monospace fact row inside the Details collapse. */
function DetailFact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-all text-foreground", mono && "font-mono text-(length:--text-micro)")}>{value}</span>
    </div>
  );
}

function OutcomeChip({ outcome }: { outcome: ToolAuditOutcome }) {
  const { t } = useTranslation();
  const meta = OUTCOME_META[outcome] ?? OUTCOME_META.unknown;
  return <StatusBadge status={meta.status} label={t(meta.key, { defaultValue: meta.defaultValue })} />;
}

function ActivityRow({
  event,
  ruleNamesById,
}: {
  event: ToolGatewayActivityEvent;
  ruleNamesById: Map<string, string>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const who = event.agentDisplayName ?? t("tools.audit.unknownAgent", { defaultValue: "An agent" });
  const action = event.toolDisplayName ?? t("tools.audit.unknownAction", { defaultValue: "an action" });
  const app = event.appDisplayName ?? event.connectionDisplayName ?? event.applicationDisplayName ?? null;
  const rawTool = detailString(event.details, "tool") ?? detailString(event.details, "toolName");

  const issueId = detailString(event.details, "issueId");
  const runId = event.runId ?? detailString(event.details, "runId");
  const agentId = event.agentId ?? detailString(event.details, "agentId");
  const reasonCode = detailString(event.details, "reasonCode") ?? event.action.replace("tool_gateway.", "");
  const matchedRuleId = detailStringArray(event.details, "matchedPolicyIds").find((id) => ruleNamesById.has(id));
  const matchedRuleName = matchedRuleId ? ruleNamesById.get(matchedRuleId) : undefined;
  const argumentsText = formattedArguments(event.details);
  const execution = detailRecord(event.details?.execution);
  const request = detailRecord(execution?.request);
  const response = detailRecord(execution?.response);
  const transport = detailString(execution, "transport");
  const requestMethod = detailString(request, "httpMethod");
  const endpoint = detailString(request, "endpoint");
  const mcpMethod = detailString(request, "mcpMethod");
  const requestId = detailString(request, "requestId");
  const httpStatus = detailNumber(response, "httpStatus");
  const contentType = detailString(response, "contentType");
  const responseBytes = detailNumber(response, "bodySizeBytes");
  const upstreamRequestId = detailString(response, "upstreamRequestId");
  const permittedNotInstalledCount = detailNumber(event.details, "permittedNotInstalledCount");
  const permittedNotInstalledConnections = Array.isArray(event.details?.permittedNotInstalledConnections)
    ? event.details.permittedNotInstalledConnections
      .map(detailRecord)
      .filter((connection): connection is Record<string, unknown> => connection !== null)
    : [];
  const isRuntimeMcpDeliveryDiagnostic = reasonCode === "permitted_connections_not_installed";
  const diagnosticCount = permittedNotInstalledCount ?? permittedNotInstalledConnections.length;

  return (
    <li className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open
          ? t("tools.audit.hideEventDetails", {
              defaultValue: "Hide activity details for {{agent}}",
              agent: who,
            })
          : t("tools.audit.showEventDetails", {
              defaultValue: "Show activity details for {{agent}}",
              agent: who,
            })}
        className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-accent/50"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          {isRuntimeMcpDeliveryDiagnostic ? (
            <span className="block text-foreground">
              {t("tools.audit.runtimeDeliveryDiagnostic", {
                defaultValue:
                  "{{agent}}'s run received 0 MCP servers — {{count}} permitted connection not installed",
                defaultValue_other:
                  "{{agent}}'s run received 0 MCP servers — {{count}} permitted connections not installed",
                agent: who,
                count: diagnosticCount,
              })}
            </span>
          ) : (
            <span className="block text-foreground">
              {app
                ? t("tools.audit.eventUsedInApp", {
                    defaultValue: "{{agent}} used {{action}} in {{app}}",
                    agent: who,
                    action,
                    app,
                  })
                : t("tools.audit.eventUsed", {
                    defaultValue: "{{agent}} used {{action}}",
                    agent: who,
                    action,
                  })}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <OutcomeChip outcome={event.normalizedOutcome} />
          <span className="text-xs text-muted-foreground">
            · <RelativeTime value={event.createdAt} />
          </span>
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border bg-muted/30 px-4 py-3 pl-10 text-sm">
          <p className="text-foreground">
            {plainReason(event, t)}
            {matchedRuleName ? (
              <>
                {" "}
                <Link to={advancedTabHref("policies")} className="text-primary hover:underline">
                  {matchedRuleName}
                </Link>
              </>
            ) : null}
          </p>

          <div className="flex flex-wrap gap-3 text-xs">
            {issueId ? (
              <Link to={`/issues/${issueId}`} className="text-primary hover:underline">
                {t("tools.audit.viewTask", { defaultValue: "View task" })}
              </Link>
            ) : null}
            {runId && agentId ? (
              <Link to={`/agents/${agentId}/runs/${runId}`} className="text-primary hover:underline">
                {t("tools.audit.viewRun", { defaultValue: "View run" })}
              </Link>
            ) : null}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {t("tools.audit.details", { defaultValue: "Details" })}
            </button>
            {detailsOpen ? (
              <div className="mt-2 space-y-1.5 text-xs">
                {rawTool ? (
                  <DetailFact label={t("tools.audit.details.actionName", { defaultValue: "Action name" })} value={rawTool} mono />
                ) : null}
                <DetailFact label={t("tools.audit.details.reasonCode", { defaultValue: "Reason code" })} value={reasonCode} mono />
                <DetailFact label={t("tools.audit.details.actorType", { defaultValue: "Actor type" })} value={event.actorType ?? "—"} />
                {runId ? <DetailFact label={t("tools.audit.details.runId", { defaultValue: "Run ID" })} value={runId} mono /> : null}
                {transport ? <DetailFact label={t("tools.audit.details.transport", { defaultValue: "Transport" })} value={transport} mono /> : null}
                {requestMethod && endpoint ? (
                  <DetailFact
                    label={t("tools.audit.details.httpRequest", { defaultValue: "HTTP request" })}
                    value={`${requestMethod} ${endpoint}`}
                    mono
                  />
                ) : null}
                {mcpMethod ? <DetailFact label={t("tools.audit.details.mcpMethod", { defaultValue: "MCP method" })} value={mcpMethod} mono /> : null}
                {requestId ? <DetailFact label={t("tools.audit.details.requestId", { defaultValue: "Request ID" })} value={requestId} mono /> : null}
                {request ? (
                  <DetailFact
                    label={t("tools.audit.details.dispatched", { defaultValue: "Dispatched" })}
                    value={request.dispatched === true
                      ? t("tools.common.yes", { defaultValue: "Yes" })
                      : t("tools.common.no", { defaultValue: "No" })}
                  />
                ) : null}
                {httpStatus !== undefined ? <DetailFact label={t("tools.audit.details.httpStatus", { defaultValue: "HTTP status" })} value={String(httpStatus)} mono /> : null}
                {contentType ? <DetailFact label={t("tools.audit.details.contentType", { defaultValue: "Content type" })} value={contentType} mono /> : null}
                {responseBytes !== undefined ? (
                  <DetailFact
                    label={t("tools.audit.details.responseSize", { defaultValue: "Response size" })}
                    value={t("tools.audit.details.bytes", {
                      defaultValue: "{{count}} bytes",
                      count: responseBytes,
                    })}
                  />
                ) : null}
                {upstreamRequestId ? <DetailFact label={t("tools.audit.details.upstreamId", { defaultValue: "Upstream ID" })} value={upstreamRequestId} mono /> : null}
                {isRuntimeMcpDeliveryDiagnostic ? (
                  <>
                    <DetailFact
                      label={t("tools.audit.details.deliveredMcpServers", {
                        defaultValue: "Delivered MCP servers",
                      })}
                      value="0"
                      mono
                    />
                    {permittedNotInstalledConnections.map((connection) => {
                      const connectionId = detailString(connection, "id");
                      const connectionName = detailString(connection, "name") ?? t("tools.audit.unnamedConnection", {
                        defaultValue: "Unnamed connection",
                      });
                      return connectionId ? (
                        <div key={connectionId} className="flex gap-2">
                          <span className="shrink-0 text-muted-foreground">
                            {t("tools.audit.notInstalled", { defaultValue: "Not installed" })}
                          </span>
                          <Link to={`/apps/${connectionId}/permissions`} className="font-medium text-primary hover:underline">
                            {connectionName}
                          </Link>
                        </div>
                      ) : null;
                    })}
                  </>
                ) : null}
                {argumentsText ? (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">
                      {t("tools.audit.details.parametersRedacted", {
                        defaultValue: "Parameters (redacted)",
                      })}
                    </span>
                    <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground">
                      {argumentsText}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function AuditTab({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const [app, setApp] = useState<string>(ALL);
  const [agent, setAgent] = useState<string>(ALL);
  const [outcome, setOutcome] = useState<string>(ALL);
  const [windowKey, setWindowKey] = useState<ToolAuditWindow>("24h");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the search box so each keystroke doesn't fire a server request.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const apps = useQuery({
    queryKey: queryKeys.tools.applications(companyId),
    queryFn: () => toolsApi.listApplications(companyId),
  });
  const agents = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });
  // Map matched rule IDs to their humanized names for the row "why" link.
  const policies = useQuery({
    queryKey: queryKeys.tools.policies(companyId),
    queryFn: () => toolsApi.listPolicies(companyId),
  });
  const ruleNamesById = useMemo(
    () => new Map((policies.data?.policies ?? []).map((p) => [p.id, p.name])),
    [policies.data],
  );

  const filters = {
    app: app === ALL ? undefined : app,
    agent: agent === ALL ? undefined : agent,
    outcome: outcome === ALL ? undefined : outcome,
    window: windowKey,
    search: search || undefined,
  };
  const hasActiveFilters =
    app !== ALL || agent !== ALL || outcome !== ALL || windowKey !== "24h" || search.length > 0;

  const activity = useInfiniteQuery({
    queryKey: queryKeys.tools.activity(companyId, {
      app: filters.app,
      agent: filters.agent,
      outcome: filters.outcome,
      window: filters.window,
      search: filters.search,
    }),
    queryFn: ({ pageParam }) =>
      toolsApi.listActivity(companyId, { ...filters, limit: PAGE_SIZE, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const events = useMemo(
    () => activity.data?.pages.flatMap((page) => page.events) ?? [],
    [activity.data],
  );

  const clearFilters = () => {
    setApp(ALL);
    setAgent(ALL);
    setOutcome(ALL);
    setWindowKey("24h");
    setSearchInput("");
    setSearch("");
  };

  return (
    <div className="space-y-4">
      <ToolsPageHeader
        title={t("tools.audit.title", { defaultValue: "Activity" })}
        description={t("tools.audit.description", {
          defaultValue:
            "What your agents actually did with your apps, newest first. Each line is one decision — allowed, blocked, asked first, waiting, or failed.",
        })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={app} onValueChange={setApp}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("tools.audit.filters.app", { defaultValue: "App" })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>
              {t("tools.audit.filters.allApps", { defaultValue: "All apps" })}
            </SelectItem>
            {(apps.data?.applications ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("tools.audit.filters.agent", { defaultValue: "Agent" })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>
              {t("tools.audit.filters.allAgents", { defaultValue: "All agents" })}
            </SelectItem>
            {(agents.data ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_FILTERS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.key, { defaultValue: o.defaultValue })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={windowKey} onValueChange={(v) => setWindowKey(v as ToolAuditWindow)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOW_FILTERS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.key, { defaultValue: o.defaultValue })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder={t("tools.audit.filters.search", { defaultValue: "Search activity…" })}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-xs"
        />
        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            {t("tools.audit.filters.clear", { defaultValue: "Clear filters" })}
          </Button>
        ) : null}
      </div>

      {activity.isLoading ? (
        <LoadingState label={t("tools.common.loading", { defaultValue: "Loading…" })} />
      ) : activity.error ? (
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      ) : events.length === 0 ? (
        hasActiveFilters ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <ScrollText className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("tools.audit.noMatchingActivity", {
                    defaultValue: "No activity matches these filters",
                  })}
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {t("tools.audit.tryDifferentFilters", {
                    defaultValue: "Try a wider time window or different filters.",
                  })}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("tools.audit.filters.clear", { defaultValue: "Clear filters" })}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <ScrollText className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("tools.audit.emptyTitle", { defaultValue: "Nothing here yet" })}
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {t("tools.audit.emptyDescription", {
                    defaultValue:
                      "As soon as your agents start using connected apps, what they do shows up here.",
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="px-0 py-0">
            <ul className="divide-y divide-border">
              {events.map((event) => (
                <ActivityRow key={event.id} event={event} ruleNamesById={ruleNamesById} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {activity.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => activity.fetchNextPage()}
            disabled={activity.isFetchingNextPage}
          >
            {activity.isFetchingNextPage
              ? t("tools.common.loading", { defaultValue: "Loading…" })
              : t("tools.audit.loadMore", { defaultValue: "Load more" })}
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {t("tools.audit.immutabilityNotice", {
          defaultValue: "Recorded by Paperclip — entries can't be edited. Sensitive values are never stored.",
        })}
      </p>
    </div>
  );
}
