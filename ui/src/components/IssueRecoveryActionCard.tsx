import { useMemo, useState } from "react";
import type {
  Agent,
  GitWorktreeBranchAncestryVerdict,
  IssueRecoveryAction,
  IssueRecoveryActionKind,
  IssueRecoveryActionOutcome,
  IssueRecoveryActionStatus,
} from "@penclipai/shared";
import type { TFunction } from "i18next";
import {
  Eye,
  GitBranch,
  GitBranchPlus,
  Loader2,
  Lock,
  OctagonAlert,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { agentUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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

/**
 * Payload for the "Re-issue on isolated workspace" action (workspace_validation only).
 * The caller composes an isolated-workspace re-issue whose git worktree bases off `baseRef`
 * — the live (checked-out) branch that diverged, or its HEAD sha when the branch is detached.
 */
export interface RecoveryReissueRequest {
  baseRef: string;
  liveBranch: string | null;
  liveHeadSha: string | null;
  expectedBranch: string | null;
}

export interface IssueRecoveryActionCardProps {
  action: IssueRecoveryAction;
  agentMap?: ReadonlyMap<string, Agent>;
  /** Preferred state hint (e.g. observe_only when watchdog tone is requested). Falls back to derived state. */
  forcedState?: RecoveryCardCardState;
  /** Optional click handler for resolve menu actions. If omitted, the buttons are not rendered. */
  onResolve?: (outcome: RecoveryResolveOutcome) => void;
  /**
   * Optional handler for the workspace_validation "Re-issue on isolated workspace" action.
   * Rendered only for a git-worktree branch-incoherence divergence with a resolvable live ref.
   * If omitted, the re-issue button is not shown.
   */
  onReissueIsolated?: (request: RecoveryReissueRequest) => void;
  /** Whether an isolated re-issue is currently in flight (disables the action + shows a spinner). */
  reissuePending?: boolean;
  /**
   * Handler for action 1 — "Reconcile forward & continue" (workspace_validation only). Rendered
   * only for an ancestry-proven (`ancestor`) git-worktree divergence; the caller invokes the S4
   * reconcile op in `forward` mode, which re-verifies ancestry server-side (the client hint is
   * never trusted). If omitted, the button is not shown.
   */
  onReconcileForward?: () => void;
  /**
   * Handler for action 2 — the audited break-glass override (workspace_validation only). Receives
   * the operator's required, non-empty reason and invokes the S4 reconcile op in `override` mode.
   * Rendered only when `canBreakGlass` is true AND this handler is provided; the server independently
   * rejects agent actors and re-checks runtime-manage permission, so UI hiding is defense-in-depth.
   */
  onBreakGlassOverride?: (reason: string) => void;
  /**
   * Whether the viewer may run the permission-gated break-glass override. When false, action 2 is
   * not rendered at all — a non-permitted user never sees the "reconcile anyway" affordance.
   */
  canBreakGlass?: boolean;
  /**
   * Handler for the lossless repair — "Repair workspace — quarantine changes & restore branch"
   * (workspace_validation only). Rendered only for a *dirty* divergence; the caller invokes the S4
   * reconcile op in `quarantine_restore` mode, which quarantines the dirty worktree onto a rescue
   * branch and restores the recorded branch. If omitted, the repair action is not shown.
   */
  onQuarantineRestore?: () => void;
  /** Whether a quarantine-restore repair is currently in flight (shares the reconcile spinner). */
  quarantineRestorePending?: boolean;
  /** Whether a reconcile (forward, override, or quarantine-restore) is currently in flight. */
  reconcilePending?: boolean;
  /** Whether the viewer can run destructive board-only actions (e.g. false-positive dismissal). */
  canFalsePositive?: boolean;
  /**
   * Rendering density. `full` (default) shows the complete metadata table; `compact` drops the
   * metadata rows for embedding beside a run on the agent run page, keeping the header, divergence
   * diagnosis, and action footer.
   */
  variant?: "full" | "compact";
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

// Human-sentence evidence sources render as prose; code-shaped sources
// (error codes, statuses) stay in the mono treatment used for run ids.
const PROSE_EVIDENCE_KEYS = ["summary", "detectedProgressSummary", "missingDisposition", "retryReason"] as const;
const CODE_EVIDENCE_KEYS = ["latestRunErrorCode", "latestRunStatus", "latestIssueStatus"] as const;

function pickEvidenceSummary(action: IssueRecoveryAction): { text: string; isCode: boolean } | null {
  const evidence = action.evidence ?? {};
  for (const key of PROSE_EVIDENCE_KEYS) {
    const next = readEvidenceString(evidence[key]);
    if (next) return { text: next, isCode: false };
  }
  for (const key of CODE_EVIDENCE_KEYS) {
    const next = readEvidenceString(evidence[key]);
    if (next) return { text: next, isCode: true };
  }
  return null;
}

function readEvidenceRunId(action: IssueRecoveryAction, key: "sourceRunId" | "correctiveRunId" | "latestRunId") {
  const evidence = action.evidence ?? {};
  const next = readEvidenceString(evidence[key]);
  return next;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asAncestryVerdict(value: unknown): GitWorktreeBranchAncestryVerdict | null {
  return value === "ancestor" || value === "diverged" || value === "unknown" ? value : null;
}

function formatShortSha(sha: string | null): string | null {
  if (!sha) return null;
  return sha.length > 10 ? sha.slice(0, 10) : sha;
}

interface WorkspaceContention {
  claimedByIssueId: string | null;
  claimedByIssueIdentifier: string | null;
  hasActiveRun: boolean;
}

interface WorkspaceDivergence {
  expectedBranch: string | null;
  liveBranch: string | null;
  expectedHeadSha: string | null;
  liveHeadSha: string | null;
  ancestryVerdict: GitWorktreeBranchAncestryVerdict | null;
  plainLanguageReason: string | null;
  cleanliness: "clean" | "dirty" | "unknown" | null;
  dirtyFileCount: number | null;
  dirtyPathSample: string[];
  contention: WorkspaceContention | null;
  rescueBranchPreview: string;
  reissueBaseRef: string | null;
}

function sanitizeBranchComponent(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9._/-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-/.]+|[-/.]+$/g, "")
      .slice(0, 120) || "issue"
  );
}

function buildRescueBranchPreview(sourceIdentifier: string | null): string {
  return `paperclip/rescue/${sanitizeBranchComponent(sourceIdentifier ?? "issue")}/`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function asNonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function readContention(value: unknown): WorkspaceContention | null {
  const record = asRecord(value);
  if (!record) return null;
  const activeRun = asRecord(record.activeRun);
  return {
    claimedByIssueId: asNonEmptyString(record.claimedByIssueId),
    claimedByIssueIdentifier: asNonEmptyString(record.claimedByIssueIdentifier),
    hasActiveRun: activeRun !== null,
  };
}

function readWorkspaceDivergence(action: IssueRecoveryAction): WorkspaceDivergence | null {
  if (action.kind !== "workspace_validation") return null;
  const workspaceValidation = asRecord(action.evidence?.workspaceValidation);
  if (!workspaceValidation || workspaceValidation.reason !== "git_worktree_branch_incoherence") return null;
  const provenance = asRecord(workspaceValidation.provenance) ?? {};
  const expectedBranch = asNonEmptyString(workspaceValidation.expectedBranch);
  const liveBranch = asNonEmptyString(workspaceValidation.actualBranch);
  const expectedHeadSha = asNonEmptyString(provenance.expectedHeadSha);
  const liveHeadSha = asNonEmptyString(provenance.actualHeadSha);
  const cleanlinessRaw = workspaceValidation.cleanliness;
  const cleanliness =
    cleanlinessRaw === "clean" || cleanlinessRaw === "dirty" || cleanlinessRaw === "unknown"
      ? cleanlinessRaw
      : null;
  const sourceIdentifier = asNonEmptyString(workspaceValidation.sourceIdentifier);
  return {
    expectedBranch,
    liveBranch,
    expectedHeadSha,
    liveHeadSha,
    ancestryVerdict: asAncestryVerdict(provenance.ancestryVerdict),
    plainLanguageReason: asNonEmptyString(provenance.plainLanguageReason),
    cleanliness,
    dirtyFileCount: asNonNegativeInt(workspaceValidation.statusEntryCount),
    dirtyPathSample: asStringArray(workspaceValidation.dirtyPathSample),
    contention: readContention(workspaceValidation.contention),
    rescueBranchPreview: buildRescueBranchPreview(sourceIdentifier),
    reissueBaseRef: liveBranch ?? liveHeadSha,
  };
}

const ANCESTRY_BADGE: Record<
  GitWorktreeBranchAncestryVerdict,
  { label: string; className: string }
> = {
  ancestor: {
    label: "Forward-only",
    className: "border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  diverged: {
    label: "Diverged",
    className: "border-red-400/50 bg-red-500/10 text-red-700 dark:text-red-300",
  },
  unknown: {
    label: "Ancestry unknown",
    className: "border-border bg-muted/60 text-muted-foreground",
  },
};

function contentionLabel(contention: WorkspaceContention): string {
  return (
    contention.claimedByIssueIdentifier ??
    (contention.claimedByIssueId ? `issue ${contention.claimedByIssueId.slice(0, 8)}` : "another task")
  );
}

function BranchFacet({
  label,
  branch,
  sha,
}: {
  label: string;
  branch: string | null;
  sha: string | null;
}) {
  const shortSha = formatShortSha(sha);
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-background/60 px-2.5 py-2">
      <div className="text-(length:--text-nano) font-medium uppercase tracking-(--tracking-label) text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {branch ? (
          <code className="truncate font-mono text-xs text-foreground/90">{branch}</code>
        ) : (
          <span className="text-xs italic text-muted-foreground">detached / unknown</span>
        )}
      </div>
      <div className="mt-0.5 pl-5 font-mono text-(length:--text-micro) text-muted-foreground">
        {shortSha ? `@ ${shortSha}` : "@ —"}
      </div>
    </div>
  );
}

function DivergenceDiagnosis({
  divergence,
  dividerClass,
}: {
  divergence: WorkspaceDivergence;
  dividerClass: string;
}) {
  const badge = ANCESTRY_BADGE[divergence.ancestryVerdict ?? "unknown"];
  return (
    <div
      data-testid="recovery-divergence-diagnosis"
      className={cn(
        "space-y-2.5 border-t bg-background/40 px-3 py-3 dark:bg-background/20 sm:px-4",
        dividerClass,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-muted-foreground">
          Divergence diagnosis
        </span>
        <Badge
          variant="outline"
          data-testid="recovery-ancestry-verdict"
          className={cn(
            "text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-label)",
            badge.className,
          )}
        >
          {badge.label}
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <BranchFacet label="Expected · recorded" branch={divergence.expectedBranch} sha={divergence.expectedHeadSha} />
        <BranchFacet label="Live · checked out" branch={divergence.liveBranch} sha={divergence.liveHeadSha} />
      </div>
      {divergence.plainLanguageReason ? (
        <p className="text-xs leading-5 text-foreground/80">{divergence.plainLanguageReason}</p>
      ) : null}
      {divergence.contention ? (
        <p
          data-testid="recovery-contention-notice"
          className="flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/5 px-2.5 py-1.5 text-xs leading-5 text-amber-900 dark:text-amber-200"
        >
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Worktree claimed by{" "}
            <code className="font-mono text-foreground/90">{contentionLabel(divergence.contention)}</code>{" "}
            {divergence.contention.hasActiveRun ? "(active run)" : "(claim held)"} — the lossless repair
            can&apos;t run while another workspace holds the live branch.
          </span>
        </p>
      ) : null}
    </div>
  );
}

function BreakGlassOverride({
  divergence,
  onConfirm,
  pending,
}: {
  divergence: WorkspaceDivergence;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation(undefined, { useSuspense: false });
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && !pending;
  const verdictBadge = ANCESTRY_BADGE[divergence.ancestryVerdict ?? "unknown"];
  const expectedSha = formatShortSha(divergence.expectedHeadSha);
  const liveSha = formatShortSha(divergence.liveHeadSha);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="recovery-action-breakglass-trigger"
          className="border-red-400/60 text-red-700 hover:bg-red-500/10 dark:border-red-500/40 dark:text-red-300"
        >
          <OctagonAlert className="h-3.5 w-3.5" aria-hidden />
          {t("issueRecoveryAction.breakGlass.trigger", {
            defaultValue: "I've verified this — reconcile anyway",
          })}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        aria-labelledby="recovery-breakglass-title"
        className="w-96 max-w-(--sz-calc-4) space-y-3 p-3"
      >
        <div className="space-y-1">
          <div
            id="recovery-breakglass-title"
            className="flex items-center gap-1.5 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-red-700 dark:text-red-300"
          >
            <OctagonAlert className="h-3.5 w-3.5" aria-hidden />
            {t("issueRecoveryAction.breakGlass.title", {
              defaultValue: "Break-glass reconciliation",
            })}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("issueRecoveryAction.breakGlass.description", {
              defaultValue:
                "This overrides Paperclip's safety check and points the recorded workspace at the live branch without an ancestry proof. Confirm the divergence below and record why before continuing.",
            })}
          </p>
        </div>
        <dl
          data-testid="recovery-breakglass-restated-divergence"
          className="space-y-1.5 rounded-md border border-red-400/40 bg-red-500/5 px-2.5 py-2 text-(length:--text-micro)"
        >
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">
              {t("issueRecoveryAction.breakGlass.recorded", {
                defaultValue: "Recorded · expected",
              })}
            </dt>
            <dd className="min-w-0 truncate font-mono text-foreground/90">
              {divergence.expectedBranch ?? t("issueRecoveryAction.detached", { defaultValue: "detached" })}
              {expectedSha ? ` @ ${expectedSha}` : ""}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">
              {t("issueRecoveryAction.breakGlass.live", {
                defaultValue: "Live · checked out",
              })}
            </dt>
            <dd className="min-w-0 truncate font-mono text-foreground/90">
              {divergence.liveBranch ?? t("issueRecoveryAction.detached", { defaultValue: "detached" })}
              {liveSha ? ` @ ${liveSha}` : ""}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">
              {t("issueRecoveryAction.breakGlass.ancestryVerdict", {
                defaultValue: "Ancestry verdict",
              })}
            </dt>
            <dd className="font-medium">{verdictBadge.label}</dd>
          </div>
        </dl>
        <div className="space-y-1">
          <Label htmlFor="recovery-breakglass-reason" className="text-(length:--text-micro) text-muted-foreground">
            {t("issueRecoveryAction.breakGlass.reason", { defaultValue: "Reason" })}{" "}
            <span className="text-red-600 dark:text-red-400">
              {t("issueRecoveryAction.breakGlass.reasonRequired", {
                defaultValue: "(required — recorded in the audit log)",
              })}
            </span>
          </Label>
          <Textarea
            id="recovery-breakglass-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("issueRecoveryAction.breakGlass.reasonPlaceholder", {
              defaultValue:
                "e.g. Verified the live branch carries only the intended follow-up commits; safe to adopt.",
            })}
            className="min-h-20 text-xs"
            data-testid="recovery-breakglass-reason"
            aria-required="true"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="w-full"
          disabled={!canSubmit}
          data-testid="recovery-action-breakglass-confirm"
          onClick={() => {
            if (!canSubmit) return;
            onConfirm(trimmedReason);
          }}
        >
          {pending
            ? t("issueRecoveryAction.breakGlass.pending", { defaultValue: "Reconciling…" })
            : t("issueRecoveryAction.breakGlass.confirm", {
              defaultValue: "Reconcile anyway (break-glass)",
            })}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function RepairWorkspace({
  divergence,
  onConfirm,
  pending,
  disabled,
  disabledReason,
}: {
  divergence: WorkspaceDivergence;
  onConfirm: () => void;
  pending: boolean;
  disabled: boolean;
  disabledReason: string | null;
}) {
  const { t } = useTranslation(undefined, { useSuspense: false });
  const dirtyCount = divergence.dirtyFileCount;
  const dirtyLabel = dirtyCount === null
    ? t("issueRecoveryAction.repair.uncommittedChanges", {
      defaultValue: "Uncommitted changes",
    })
    : t(
      dirtyCount === 1
        ? "issueRecoveryAction.repair.uncommittedChangeCount_one"
        : "issueRecoveryAction.repair.uncommittedChangeCount_other",
      {
        count: dirtyCount,
        defaultValue: dirtyCount === 1
          ? "{{count}} uncommitted change"
          : "{{count}} uncommitted changes",
      },
    );
  const trigger = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending || disabled}
      data-testid="recovery-action-repair-trigger"
      className="border-sky-400/50 text-sky-700 hover:bg-sky-500/10 dark:border-sky-500/40 dark:text-sky-300"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Wrench className="h-3.5 w-3.5" aria-hidden />
      )}
      {t("issueRecoveryAction.repair.trigger", {
        defaultValue: "Repair workspace — quarantine changes & restore branch",
      })}
    </Button>
  );

  if (disabled) {
    return (
      <div className="flex flex-col gap-1" data-testid="recovery-action-repair-disabled">
        {trigger}
        {disabledReason ? (
          <span className="text-(length:--text-nano) leading-4 text-muted-foreground">
            {disabledReason}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        aria-labelledby="recovery-repair-title"
        className="w-96 max-w-(--sz-calc-4) space-y-3 p-3"
      >
        <div className="space-y-1">
          <div
            id="recovery-repair-title"
            className="flex items-center gap-1.5 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-sky-700 dark:text-sky-300"
          >
            <Wrench className="h-3.5 w-3.5" aria-hidden />
            {t("issueRecoveryAction.repair.title", { defaultValue: "Repair workspace" })}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("issueRecoveryAction.repair.description", {
              defaultValue:
                "This is lossless — no reason required. Your uncommitted changes are committed onto a fresh rescue branch, then the recorded branch is restored so the task can resume. The live branch is left exactly as it is.",
            })}
          </p>
        </div>
        <dl
          data-testid="recovery-repair-restated"
          className="space-y-1.5 rounded-md border border-sky-400/30 bg-sky-500/5 px-2.5 py-2 text-(length:--text-micro)"
        >
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">
              {t("issueRecoveryAction.repair.dirtyChanges", { defaultValue: "Dirty changes" })}
            </dt>
            <dd data-testid="recovery-repair-dirty-count" className="font-medium text-foreground/90">
              {dirtyLabel}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">
              {t("issueRecoveryAction.repair.liveBranch", { defaultValue: "Live branch" })}
            </dt>
            <dd className="min-w-0 truncate font-mono text-foreground/90">
              {divergence.liveBranch ?? t("issueRecoveryAction.detached", { defaultValue: "detached" })}
              <span className="ml-1 font-sans text-muted-foreground">
                {t("issueRecoveryAction.repair.leftUntouched", { defaultValue: "(left untouched)" })}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">
              {t("issueRecoveryAction.repair.rescueBranch", { defaultValue: "Rescue branch" })}
            </dt>
            <dd
              data-testid="recovery-repair-rescue-branch"
              className="min-w-0 truncate font-mono text-foreground/90"
            >
              {divergence.rescueBranchPreview}
              <span className="text-muted-foreground">&lt;timestamp&gt;</span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">
              {t("issueRecoveryAction.repair.restoreTo", { defaultValue: "Restore to" })}
            </dt>
            <dd className="min-w-0 truncate font-mono text-foreground/90">
              {divergence.expectedBranch ?? t("issueRecoveryAction.repair.recordedBranch", {
                defaultValue: "recorded branch",
              })}
            </dd>
          </div>
        </dl>
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={pending}
          data-testid="recovery-action-repair-confirm"
          onClick={() => {
            if (pending) return;
            onConfirm();
          }}
        >
          {pending
            ? t("issueRecoveryAction.repair.pending", { defaultValue: "Repairing…" })
            : t("issueRecoveryAction.repair.confirm", {
              defaultValue: "Quarantine changes & restore branch",
            })}
        </Button>
      </PopoverContent>
    </Popover>
  );
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
    <div className="grid grid-cols-(--gtc-8) gap-x-3 gap-y-0 px-3 py-1.5 text-xs sm:px-4">
      <dt className="truncate text-(length:--text-micro) font-medium uppercase tracking-(--tracking-label) text-muted-foreground">
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
        <span className="font-sans text-(length:--text-micro) text-muted-foreground">{status}</span>
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
  onReissueIsolated,
  reissuePending = false,
  onReconcileForward,
  onBreakGlassOverride,
  onQuarantineRestore,
  quarantineRestorePending = false,
  canBreakGlass = false,
  reconcilePending = false,
  canFalsePositive = false,
  variant = "full",
  className,
}: IssueRecoveryActionCardProps) {
  const { t, i18n } = useTranslation(undefined, { useSuspense: false });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const cardState: RecoveryCardCardState = forcedState ?? deriveRecoveryCardState(action);
  const tone = STATE_TONE[cardState];
  const ToneIcon = tone.Icon;
  const divergence = useMemo(() => readWorkspaceDivergence(action), [action]);
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
  const reissueBaseRef = divergence?.reissueBaseRef ?? null;
  const showReissueAction =
    onReissueIsolated !== undefined &&
    cardState !== "resolved" &&
    divergence !== null &&
    reissueBaseRef !== null;
  const reissueVerdictBadge = divergence
    ? ANCESTRY_BADGE[divergence.ancestryVerdict ?? "unknown"]
    : null;
  // Action 1 — the ancestry-proven safe path. Only offered when the server-computed verdict is
  // "ancestor"; the server re-verifies before mutating, so this gate mirrors (not replaces) it.
  const showReconcileForward =
    onReconcileForward !== undefined &&
    cardState !== "resolved" &&
    divergence !== null &&
    divergence.ancestryVerdict === "ancestor";
  // Action 2 — the break-glass override. Permission-hidden: absent entirely unless the viewer is a
  // permitted operator. The confirm step (restated divergence + required reason) lives in the popover.
  const showBreakGlass =
    onBreakGlassOverride !== undefined &&
    cardState !== "resolved" &&
    divergence !== null &&
    canBreakGlass;
  // The lossless repair — offered only for a *dirty* divergence (a clean one reconciles forward or
  // via break-glass, with nothing to quarantine). Disabled when the live branch is contended by an
  // active claimant, since the server refuses `quarantine_restore` in that case.
  const repairContention = divergence?.contention ?? null;
  const showRepairAction =
    onQuarantineRestore !== undefined &&
    cardState !== "resolved" &&
    divergence !== null &&
    divergence.cleanliness === "dirty";
  const repairDisabledReason = repairContention
    ? t("issueRecoveryAction.repair.contended", {
      claimant: contentionLabel(repairContention),
      defaultValue: "Held by {{claimant}} — re-issue on an isolated workspace instead.",
    })
    : null;
  // When contended, the re-issue is the recommended path, so it takes the primary emphasis and a
  // "Recommended" hint while the repair button is disabled.
  const reissueRecommended = showRepairAction && repairContention !== null;
  const showFooter =
    showResolveActions ||
    showReissueAction ||
    showReconcileForward ||
    showBreakGlass ||
    showRepairAction;

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
        "relative w-full overflow-hidden rounded-lg border text-sm shadow-(--shadow-extract-8)",
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
          <p className="mt-1 text-sm leading-6">{headline}</p>
        </div>
      </header>
      {variant === "compact" ? null : (
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
            evidenceSummary.isCode ? (
              <span className="break-words font-mono text-(length:--text-micro) text-foreground/80">
                {evidenceSummary.text}
              </span>
            ) : (
              <span className="text-xs leading-5 text-foreground/80">{evidenceSummary.text}</span>
            )
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
      )}
      {divergence ? <DivergenceDiagnosis divergence={divergence} dividerClass={tone.divider} /> : null}
      {showFooter ? (
        <div className={cn("flex flex-wrap items-center gap-2 border-t px-3 py-2.5 sm:px-4", tone.divider)}>
          {showResolveActions ? (
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
          ) : null}
          {showReconcileForward ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={reconcilePending}
              data-testid="recovery-action-reconcile-forward"
              onClick={() => onReconcileForward?.()}
            >
              {reconcilePending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              {t("issueRecoveryAction.reconcileForward", {
                defaultValue: "Reconcile forward & continue",
              })}
            </Button>
          ) : null}
          {showRepairAction && divergence ? (
            <RepairWorkspace
              divergence={divergence}
              pending={quarantineRestorePending}
              disabled={repairContention !== null}
              disabledReason={repairDisabledReason}
              onConfirm={() => onQuarantineRestore?.()}
            />
          ) : null}
          {showReissueAction && divergence && reissueBaseRef ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={reissueRecommended ? "default" : "outline"}
                  disabled={reissuePending}
                  data-testid="recovery-action-reissue-trigger"
                  data-recommended={reissueRecommended ? "true" : undefined}
                >
                  {reissuePending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <GitBranchPlus className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {t("issueRecoveryAction.reissue.trigger", {
                    defaultValue: "Re-issue on isolated workspace",
                  })}
                  {reissueRecommended ? (
                    <span
                      data-testid="recovery-reissue-recommended"
                      className="ml-1 rounded-sm bg-background/25 px-1.5 py-0.5 text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-label)"
                    >
                      {t("issueRecoveryAction.reissue.recommended", { defaultValue: "Recommended" })}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={6} className="w-80 space-y-3 p-3">
                <div className="space-y-1">
                  <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-eyebrow) text-muted-foreground">
                    {t("issueRecoveryAction.reissue.title", {
                      defaultValue: "Re-issue on isolated workspace",
                    })}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t("issueRecoveryAction.reissue.description", {
                      defaultValue:
                        "Creates a fresh copy of this task on an isolated git worktree based on the live branch. Your current workspace and its commits are left untouched.",
                    })}
                  </p>
                </div>
                <dl className="space-y-1 rounded-md border border-border/70 bg-muted/30 px-2.5 py-2 text-(length:--text-micro)">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      {t("issueRecoveryAction.reissue.baseRef", { defaultValue: "Base ref" })}
                    </dt>
                    <dd className="min-w-0 truncate font-mono text-foreground/90">{reissueBaseRef}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      {t("issueRecoveryAction.reissue.recorded", { defaultValue: "Recorded" })}
                    </dt>
                    <dd className="min-w-0 truncate font-mono text-foreground/80">
                      {divergence.expectedBranch ?? "—"}
                    </dd>
                  </div>
                  {reissueVerdictBadge ? (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">
                        {t("issueRecoveryAction.reissue.ancestry", { defaultValue: "Ancestry" })}
                      </dt>
                      <dd className="font-medium">{reissueVerdictBadge.label}</dd>
                    </div>
                  ) : null}
                </dl>
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={reissuePending}
                  data-testid="recovery-action-reissue-confirm"
                  onClick={() =>
                    onReissueIsolated?.({
                      baseRef: reissueBaseRef,
                      liveBranch: divergence.liveBranch,
                      liveHeadSha: divergence.liveHeadSha,
                      expectedBranch: divergence.expectedBranch,
                    })
                  }
                >
                  {reissuePending
                    ? t("issueRecoveryAction.reissue.pending", { defaultValue: "Creating…" })
                    : t("issueRecoveryAction.reissue.confirm", {
                      defaultValue: "Create isolated re-issue",
                    })}
                </Button>
              </PopoverContent>
            </Popover>
          ) : null}
          {showBreakGlass && divergence ? (
            <BreakGlassOverride
              divergence={divergence}
              pending={reconcilePending}
              onConfirm={(reason) => onBreakGlassOverride?.(reason)}
            />
          ) : null}
          {showResolveActions ? (
            cardState === "observe_only" ? (
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
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export type { IssueRecoveryActionStatus };

export default IssueRecoveryActionCard;
