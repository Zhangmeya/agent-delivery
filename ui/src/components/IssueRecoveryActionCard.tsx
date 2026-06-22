import { useMemo } from "react";
import type {
  Agent,
  IssueRecoveryAction,
  IssueRecoveryActionKind,
  IssueRecoveryActionOutcome,
  IssueRecoveryActionStatus,
} from "@penclipai/shared";
import type { TFunction } from "i18next";
import { Eye, OctagonAlert, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { agentUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  deriveRecoveryDisplayState,
  type RecoveryDisplayState,
} from "@/lib/recovery-display";

export type RecoveryCardCardState = RecoveryDisplayState;
export const deriveRecoveryCardState = deriveRecoveryDisplayState;

export type RecoveryResolveOutcome =
  | "todo"
  | "done"
  | "in_review"
  | "false_positive_done"
  | "false_positive_in_review";

export interface IssueRecoveryActionCardProps {
  action: IssueRecoveryAction;
  agentMap?: ReadonlyMap<string, Agent>;
  /** Preferred state hint (e.g. observe_only when watchdog tone is requested). Falls back to derived state. */
  forcedState?: RecoveryCardCardState;
  /** Optional click handler for resolve menu actions. If omitted, the buttons are not rendered. */
  onResolve?: (outcome: RecoveryResolveOutcome) => void;
  /** Whether the viewer can run destructive board-only actions (e.g. false-positive dismissal). */
  canFalsePositive?: boolean;
  className?: string;
}

const KIND_LABEL: Record<IssueRecoveryActionKind, { key: string; defaultValue: string }> = {
  missing_disposition: {
    key: "issueRecoveryAction.kind.missing_disposition",
    defaultValue: "Missing Disposition",
  },
  stranded_assigned_issue: {
    key: "issueRecoveryAction.kind.stranded_assigned_issue",
    defaultValue: "Stranded Task",
  },
  workspace_validation: {
    key: "issueRecoveryAction.kind.workspace_validation",
    defaultValue: "Workspace Validation",
  },
  configuration_validation: {
    key: "issueRecoveryAction.kind.configuration_validation",
    defaultValue: "Configuration Validation",
  },
  active_run_watchdog: {
    key: "issueRecoveryAction.kind.active_run_watchdog",
    defaultValue: "Active Watchdog",
  },
  issue_graph_liveness: {
    key: "issueRecoveryAction.kind.issue_graph_liveness",
    defaultValue: "Graph Liveness",
  },
};

const KIND_HEADLINE: Record<IssueRecoveryActionKind, { key: string; defaultValue: string }> = {
  missing_disposition: {
    key: "issueRecoveryAction.headline.missing_disposition",
    defaultValue: "This task's run finished, but no next step was chosen.",
  },
  stranded_assigned_issue: {
    key: "issueRecoveryAction.headline.stranded_assigned_issue",
    defaultValue: "Paperclip retried this task's last run and it still has no live execution path.",
  },
  workspace_validation: {
    key: "issueRecoveryAction.headline.workspace_validation",
    defaultValue: "Paperclip stopped this run because the task's git workspace could not be validated.",
  },
  configuration_validation: {
    key: "issueRecoveryAction.headline.configuration_validation",
    defaultValue: "Paperclip stopped before dispatching this run because required secret/env bindings are missing.",
  },
  active_run_watchdog: {
    key: "issueRecoveryAction.headline.active_run_watchdog",
    defaultValue: "The active run has been silent. Recovery is observing without interrupting it.",
  },
  issue_graph_liveness: {
    key: "issueRecoveryAction.headline.issue_graph_liveness",
    defaultValue: "Paperclip detected this task lost a live action path. A recovery owner needs to act.",
  },
};

const STATE_TONE: Record<RecoveryCardCardState, {
  label: string;
  labelKey: string;
  containerClass: string;
  iconWrapClass: string;
  iconClass: string;
  labelClass: string;
  Icon: typeof TriangleAlert;
  divider: string;
}> = {
  needed: {
    label: "RECOVERY NEEDED",
    labelKey: "issueRecoveryAction.state.needed",
    containerClass:
      "border-amber-300/70 bg-amber-50/85 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
    iconWrapClass: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    iconClass: "text-amber-700 dark:text-amber-300",
    labelClass: "text-amber-900 dark:text-amber-200",
    Icon: TriangleAlert,
    divider: "border-amber-300/60 dark:border-amber-500/30",
  },
  in_progress: {
    label: "RECOVERY IN PROGRESS",
    labelKey: "issueRecoveryAction.state.in_progress",
    containerClass:
      "border-sky-300/70 bg-sky-50/80 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100",
    iconWrapClass: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
    iconClass: "text-sky-700 dark:text-sky-300",
    labelClass: "text-sky-900 dark:text-sky-200",
    Icon: RefreshCw,
    divider: "border-sky-300/60 dark:border-sky-500/30",
  },
  observe_only: {
    label: "OBSERVING ACTIVE RUN",
    labelKey: "issueRecoveryAction.state.observe_only",
    containerClass:
      "border-border bg-muted/40 text-foreground dark:bg-muted/20",
    iconWrapClass: "bg-muted text-foreground/70",
    iconClass: "text-muted-foreground",
    labelClass: "text-muted-foreground",
    Icon: Eye,
    divider: "border-border/70",
  },
  escalated: {
    label: "RECOVERY ESCALATED",
    labelKey: "issueRecoveryAction.state.escalated",
    containerClass:
      "border-red-400/60 bg-red-50/85 text-red-950 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100",
    iconWrapClass: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
    iconClass: "text-red-700 dark:text-red-300",
    labelClass: "text-red-900 dark:text-red-200",
    Icon: OctagonAlert,
    divider: "border-red-400/50 dark:border-red-500/30",
  },
  resolved: {
    label: "RECOVERY RESOLVED",
    labelKey: "issueRecoveryAction.state.resolved",
    containerClass:
      "border-emerald-300/70 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
    iconWrapClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
    iconClass: "text-emerald-700 dark:text-emerald-300",
    labelClass: "text-emerald-900 dark:text-emerald-200",
    Icon: Sparkles,
    divider: "border-emerald-300/60 dark:border-emerald-500/30",
  },
};

const OUTCOME_LABEL: Record<IssueRecoveryActionOutcome, { key: string; defaultValue: string }> = {
  restored: {
    key: "issueRecoveryAction.outcome.restored",
    defaultValue: "restored",
  },
  delegated: {
    key: "issueRecoveryAction.outcome.delegated",
    defaultValue: "delegated to follow-up",
  },
  false_positive: {
    key: "issueRecoveryAction.outcome.false_positive",
    defaultValue: "false positive",
  },
  blocked: {
    key: "issueRecoveryAction.outcome.blocked",
    defaultValue: "blocked",
  },
  escalated: {
    key: "issueRecoveryAction.outcome.escalated",
    defaultValue: "escalated",
  },
  cancelled: {
    key: "issueRecoveryAction.outcome.cancelled",
    defaultValue: "cancelled",
  },
};

const ARIA_STATE: Record<RecoveryCardCardState, { key: string; defaultValue: string }> = {
  needed: {
    key: "issueRecoveryAction.ariaState.needed",
    defaultValue: "needed",
  },
  in_progress: {
    key: "issueRecoveryAction.ariaState.in_progress",
    defaultValue: "in progress",
  },
  observe_only: {
    key: "issueRecoveryAction.ariaState.observe_only",
    defaultValue: "observing active run",
  },
  escalated: {
    key: "issueRecoveryAction.ariaState.escalated",
    defaultValue: "escalated",
  },
  resolved: {
    key: "issueRecoveryAction.ariaState.resolved",
    defaultValue: "resolved",
  },
};

const NEXT_ACTION_TRANSLATION_KEY: Record<string, string> = {
  "Choose and record a valid issue disposition.":
    "issueRecoveryAction.nextAction.chooseDisposition",
  "Choose and record a valid issue disposition without copying transcript content.":
    "issueRecoveryAction.nextAction.chooseDispositionWithoutTranscript",
  "Choose and record a valid issue disposition without copying transcript content":
    "issueRecoveryAction.nextAction.chooseDispositionWithoutTranscript",
  "Restore a live execution path.":
    "issueRecoveryAction.nextAction.restoreLivePathShort",
  "Restore a live execution path":
    "issueRecoveryAction.nextAction.restoreLivePathShort",
  "Restore a live execution path, fix the runtime/adapter failure, or record an intentional manual resolution.":
    "issueRecoveryAction.nextAction.restoreLivePath",
  "Review stale active run":
    "issueRecoveryAction.nextAction.reviewStaleActiveRun",
};

function readEvidenceString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}…` : trimmed;
}

function pickEvidenceSummary(action: IssueRecoveryAction): string | null {
  const evidence = action.evidence ?? {};
  const candidates = [
    "summary",
    "detectedProgressSummary",
    "missingDisposition",
    "retryReason",
    "latestRunErrorCode",
    "latestRunStatus",
    "latestIssueStatus",
  ] as const;
  for (const key of candidates) {
    const next = readEvidenceString(evidence[key]);
    if (next) return next;
  }
  return null;
}

function readEvidenceRunId(action: IssueRecoveryAction, key: "sourceRunId" | "correctiveRunId" | "latestRunId") {
  const evidence = action.evidence ?? {};
  const next = readEvidenceString(evidence[key]);
  return next;
}

function translateOutcomeLabel(t: TFunction, outcome: IssueRecoveryActionOutcome): string {
  const entry = OUTCOME_LABEL[outcome];
  return t(entry.key, { defaultValue: entry.defaultValue });
}

function translateNextAction(t: TFunction, value: string): string {
  const key = NEXT_ACTION_TRANSLATION_KEY[value.trim()];
  if (!key) return value;
  return t(key, { defaultValue: value });
}

function readWakePolicySummary(action: IssueRecoveryAction, t: TFunction): string | null {
  const policy = action.wakePolicy;
  if (!policy) return null;
  const type = readEvidenceString(policy.type);
  if (!type) return null;
  if (type === "wake_owner") {
    return t("issueRecoveryAction.wake.correctiveWakeQueued", {
      defaultValue: "Corrective wake queued",
    });
  }
  if (type === "board_escalation") {
    return t("issueRecoveryAction.wake.escalatedToBoard", {
      defaultValue: "Escalated to board",
    });
  }
  if (type === "manual") {
    return t("issueRecoveryAction.wake.manual", {
      defaultValue: "Manual",
    });
  }
  if (type === "monitor") {
    const interval = readEvidenceString(policy.intervalLabel);
    return interval
      ? t("issueRecoveryAction.wake.monitorScheduledWithInterval", {
        interval,
        defaultValue: "Monitor scheduled · {{interval}}",
      })
      : t("issueRecoveryAction.wake.monitorScheduled", {
        defaultValue: "Monitor scheduled",
      });
  }
  return type.replaceAll("_", " ");
}

function formatTimeShort(
  value: string | Date | null | undefined,
  t: TFunction,
  locale?: string,
): string | null {
  if (!value) return null;
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const now = Date.now();
    const diffMs = date.getTime() - now;
    const absMin = Math.round(Math.abs(diffMs) / 60_000);
    if (absMin < 60) {
      return diffMs >= 0
        ? t("issueRecoveryAction.time.inMinutes", {
          count: absMin,
          defaultValue: "in {{count}}m",
        })
        : t("issueRecoveryAction.time.minutesAgo", {
          count: absMin,
          defaultValue: "{{count}}m ago",
        });
    }
    return date.toLocaleString(locale === "zh-CN" ? "zh-CN" : undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function shortenRunId(runId: string | null | undefined) {
  if (!runId) return null;
  if (runId.length <= 12) return runId;
  return runId.slice(0, 8);
}

function MetadataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-0 px-3 py-1.5 text-xs sm:px-4">
      <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-foreground/90">{children}</dd>
    </div>
  );
}

function MissingValue() {
  return <span className="text-muted-foreground">—</span>;
}

function AgentLink({
  agentId,
  agentMap,
  fallback,
  t,
}: {
  agentId: string | null | undefined;
  agentMap?: ReadonlyMap<string, Agent>;
  fallback?: string | null;
  t: TFunction;
}) {
  if (!agentId) {
    return fallback ? <span>{fallback}</span> : <MissingValue />;
  }
  const agent = agentMap?.get(agentId);
  const label = agent?.name ?? t("issueRecoveryAction.owner.unknownAgent", {
    id: agentId.slice(0, 8),
    defaultValue: "agent {{id}}",
  });
  if (agent) {
    return (
      <Link
        to={agentUrl(agent)}
        className="rounded-sm font-medium underline-offset-2 hover:underline"
      >
        {label}
      </Link>
    );
  }
  return <span className="font-medium">{label}</span>;
}

function RunChip({
  runId,
  agentId,
  status,
  t,
}: {
  runId: string | null;
  agentId: string | null | undefined;
  status?: string | null;
  t: TFunction;
}) {
  if (!runId) return <MissingValue />;
  const short = shortenRunId(runId);
  const inner = (
    <>
      <code className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
        {t("issueRecoveryAction.runShort", {
          id: short,
          defaultValue: "run {{id}}",
        })}
      </code>
      {status ? (
        <span className="font-sans text-[11px] text-muted-foreground">{status}</span>
      ) : null}
    </>
  );
  if (agentId) {
    return (
      <Link
        to={`/agents/${agentId}/runs/${runId}`}
        className="inline-flex items-center gap-2 rounded-sm underline-offset-2 hover:underline"
      >
        {inner}
      </Link>
    );
  }
  return <span className="inline-flex items-center gap-2">{inner}</span>;
}

const RESOLVE_OPTIONS: Array<{
  outcome: RecoveryResolveOutcome;
  label: string;
  labelKey: string;
  description: string;
  descriptionKey: string;
  destructive?: boolean;
  boardOnly?: boolean;
}> = [
  {
    outcome: "todo",
    label: "Try again",
    labelKey: "issueRecoveryAction.resolve.todo.label",
    description: "Dismiss recovery and return the source issue to todo.",
    descriptionKey: "issueRecoveryAction.resolve.todo.description",
  },
  {
    outcome: "done",
    label: "Mark issue done",
    labelKey: "issueRecoveryAction.resolve.done.label",
    description: "Restore by recording the requested work as complete.",
    descriptionKey: "issueRecoveryAction.resolve.done.description",
  },
  {
    outcome: "in_review",
    label: "Send for review",
    labelKey: "issueRecoveryAction.resolve.in_review.label",
    description: "Hand off to a reviewer with a real review path.",
    descriptionKey: "issueRecoveryAction.resolve.in_review.description",
  },
  {
    outcome: "false_positive_done",
    label: "False positive, done",
    labelKey: "issueRecoveryAction.resolve.false_positive_done.label",
    description: "Dismiss recovery and mark the source issue complete.",
    descriptionKey: "issueRecoveryAction.resolve.false_positive_done.description",
    destructive: true,
    boardOnly: true,
  },
  {
    outcome: "false_positive_in_review",
    label: "False positive, review",
    labelKey: "issueRecoveryAction.resolve.false_positive_in_review.label",
    description: "Dismiss recovery and send the source issue for review.",
    descriptionKey: "issueRecoveryAction.resolve.false_positive_in_review.description",
    destructive: true,
    boardOnly: true,
  },
];

export function IssueRecoveryActionCard({
  action,
  agentMap,
  forcedState,
  onResolve,
  canFalsePositive = false,
  className,
}: IssueRecoveryActionCardProps) {
  const { t, i18n } = useTranslation(undefined, { useSuspense: false });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const cardState: RecoveryCardCardState = forcedState ?? deriveRecoveryCardState(action);
  const tone = STATE_TONE[cardState];
  const ToneIcon = tone.Icon;
  const stateLabel = t(tone.labelKey, { defaultValue: tone.label });
  const kindLabel = (() => {
    const entry = KIND_LABEL[action.kind];
    return entry ? t(entry.key, { defaultValue: entry.defaultValue }) : action.kind;
  })();

  const headline = useMemo(() => {
    if (cardState === "resolved" && action.outcome) {
      return t("issueRecoveryAction.headline.resolved", {
        outcome: translateOutcomeLabel(t, action.outcome),
        defaultValue: "Recovery resolved as {{outcome}}.",
      });
    }
    const entry = KIND_HEADLINE[action.kind] ?? KIND_HEADLINE.missing_disposition;
    return t(entry.key, { defaultValue: entry.defaultValue });
  }, [action.kind, action.outcome, cardState, t]);

  const wakeSummary = readWakePolicySummary(action, t);
  const evidenceSummary = pickEvidenceSummary(action);
  const sourceRunId = readEvidenceRunId(action, "sourceRunId") ?? readEvidenceRunId(action, "latestRunId");
  const correctiveRunId = readEvidenceRunId(action, "correctiveRunId");
  const showAttempt = action.attemptCount > 1 && action.maxAttempts !== null;
  const showTimeoutInline = (() => {
    if (!action.timeoutAt) return false;
    try {
      const date = action.timeoutAt instanceof Date ? action.timeoutAt : new Date(action.timeoutAt);
      const diffMs = date.getTime() - Date.now();
      return diffMs > 0 && diffMs < 60 * 60 * 1000;
    } catch {
      return false;
    }
  })();
  const updatedAtLabel = formatTimeShort(action.updatedAt, t, locale);

  const ariaEntry = ARIA_STATE[cardState];
  const ariaState = t(ariaEntry.key, { defaultValue: ariaEntry.defaultValue });

  const showResolveActions = onResolve !== undefined && cardState !== "resolved";
  const visibleResolveOptions = RESOLVE_OPTIONS.filter((option) => {
    if (option.boardOnly && !canFalsePositive) return false;
    return true;
  });

  return (
    <section
      role="status"
      aria-label={t("issueRecoveryAction.ariaLabel", {
        state: ariaState,
        defaultValue: "Recovery action: {{state}}",
      })}
      data-recovery-state={cardState}
      data-recovery-kind={action.kind}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border text-sm shadow-[0_1px_0_rgba(15,23,42,0.02)]",
        tone.containerClass,
        className,
      )}
    >
      <header className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            tone.iconWrapClass,
          )}
          aria-hidden
        >
          <ToneIcon className={cn("h-4 w-4", tone.iconClass)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <span className={tone.labelClass}>{stateLabel}</span>
            <span className="text-muted-foreground/60" aria-hidden>·</span>
            <code className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[11px] tracking-normal text-muted-foreground">
              {kindLabel}
            </code>
            {updatedAtLabel ? (
              <>
                <span className="text-muted-foreground/60" aria-hidden>·</span>
                <span className="font-medium normal-case tracking-normal text-muted-foreground">
                  {updatedAtLabel}
                </span>
              </>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] leading-6">{headline}</p>
        </div>
      </header>
      <dl className={cn("border-t bg-background/40 dark:bg-background/20", tone.divider)}>
        <MetadataRow label={t("issueRecoveryAction.metadata.owner", { defaultValue: "Owner" })}>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {action.ownerType === "agent" && action.ownerAgentId ? (
              <>
                <span className="text-muted-foreground">
                  {t("issueRecoveryAction.owner.recovery", { defaultValue: "Recovery:" })}
                </span>
                <AgentLink agentId={action.ownerAgentId} agentMap={agentMap} t={t} />
              </>
            ) : action.ownerType === "board" ? (
              <span className="font-medium">
                {t("issueRecoveryAction.owner.board", { defaultValue: "Board" })}
              </span>
            ) : action.ownerType === "user" && action.ownerUserId ? (
              <span className="font-medium">
                {t("issueRecoveryAction.owner.user", {
                  id: action.ownerUserId.slice(0, 6),
                  defaultValue: "user {{id}}",
                })}
              </span>
            ) : action.ownerType === "system" ? (
              <span className="font-medium">
                {t("issueRecoveryAction.owner.system", { defaultValue: "System" })}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t("issueRecoveryAction.owner.unassigned", {
                  defaultValue: "unassigned — pick one to wake them",
                })}
              </span>
            )}
            {action.returnOwnerAgentId ? (
              <>
                <span className="text-muted-foreground">
                  {t("issueRecoveryAction.owner.returnsTo", { defaultValue: "→ Returns to:" })}
                </span>
                <AgentLink agentId={action.returnOwnerAgentId} agentMap={agentMap} t={t} />
              </>
            ) : null}
          </span>
        </MetadataRow>
        <MetadataRow label={t("issueRecoveryAction.metadata.sourceRun", { defaultValue: "Source run" })}>
          <RunChip runId={sourceRunId} agentId={action.previousOwnerAgentId} t={t} />
        </MetadataRow>
        {correctiveRunId ? (
          <MetadataRow label={t("issueRecoveryAction.metadata.correctiveRun", { defaultValue: "Corrective run" })}>
            <RunChip runId={correctiveRunId} agentId={action.previousOwnerAgentId} t={t} />
          </MetadataRow>
        ) : null}
        <MetadataRow label={t("issueRecoveryAction.metadata.evidence", { defaultValue: "Evidence" })}>
          {evidenceSummary ? (
            <span className="break-words font-mono text-[11px] text-foreground/80">{evidenceSummary}</span>
          ) : (
            <MissingValue />
          )}
        </MetadataRow>
        <MetadataRow label={t("issueRecoveryAction.metadata.nextAction", { defaultValue: "Next action" })}>
          {action.nextAction ? <span>{translateNextAction(t, action.nextAction)}</span> : <MissingValue />}
        </MetadataRow>
        <MetadataRow label={t("issueRecoveryAction.metadata.wake", { defaultValue: "Wake" })}>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {wakeSummary ? <span>{wakeSummary}</span> : <MissingValue />}
            {showAttempt ? (
              <span className="rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t("issueRecoveryAction.attemptOf", {
                  attempt: action.attemptCount,
                  maxAttempts: action.maxAttempts,
                  defaultValue: "attempt {{attempt}} of {{maxAttempts}}",
                })}
              </span>
            ) : null}
            {showTimeoutInline ? (
              <span className="rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t("issueRecoveryAction.timesOut", {
                  time: formatTimeShort(action.timeoutAt, t, locale) ?? t("issueRecoveryAction.time.soon", { defaultValue: "soon" }),
                  defaultValue: "Times out {{time}}",
                })}
              </span>
            ) : null}
          </span>
        </MetadataRow>
        {cardState === "resolved" && action.outcome ? (
          <MetadataRow label={t("issueRecoveryAction.metadata.resolution", { defaultValue: "Resolution" })}>
            <span className={cn("font-medium", tone.labelClass)}>
              {t(action.resolvedAt ? "issueRecoveryAction.resolvedAsWithTime" : "issueRecoveryAction.resolvedAs", {
                outcome: translateOutcomeLabel(t, action.outcome),
                time: action.resolvedAt ? formatTimeShort(action.resolvedAt, t, locale) ?? "" : "",
                defaultValue: action.resolvedAt
                  ? "Resolved as {{outcome}} · {{time}}"
                  : "Resolved as {{outcome}}",
              })}
            </span>
          </MetadataRow>
        ) : null}
      </dl>
      {showResolveActions ? (
        <div className={cn("flex flex-wrap items-center gap-2 border-t px-3 py-2.5 sm:px-4", tone.divider)}>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="default"
                data-testid="recovery-action-resolve-trigger"
                aria-label={t("issueRecoveryAction.resolve.ariaLabel", { defaultValue: "Resolve recovery" })}
              >
                {t("issueRecoveryAction.resolve.trigger", { defaultValue: "Resolve…" })}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-72 p-1.5"
            >
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("issueRecoveryAction.resolve.heading", { defaultValue: "Resolve recovery" })}
              </div>
              <div className="flex flex-col">
                {visibleResolveOptions.map((option) => (
                  <button
                    key={option.outcome}
                    type="button"
                    onClick={() => onResolve?.(option.outcome)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      option.destructive ? "text-destructive" : null,
                    )}
                  >
                    <span className="font-medium leading-5">
                      {t(option.labelKey, { defaultValue: option.label })}
                    </span>
                    <span className="text-[11px] leading-4 text-muted-foreground">
                      {t(option.descriptionKey, { defaultValue: option.description })}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {cardState === "observe_only" ? (
            <span className="text-[11px] text-muted-foreground">
              {t("issueRecoveryAction.footer.observeOnly", {
                defaultValue: "Recovery is observing without interrupting the live run.",
              })}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {t("issueRecoveryAction.footer.decisionRequired", {
                defaultValue: "The card stays open until an explicit decision is recorded.",
              })}
            </span>
          )}
        </div>
      ) : null}
    </section>
  );
}

export type { IssueRecoveryActionStatus };

export default IssueRecoveryActionCard;
