import type { TFunction } from "i18next";
import { formatDateTime } from "./utils";

type RetryAwareRun = {
  status: string;
  retryOfRunId?: string | null;
  scheduledRetryAt?: string | Date | null;
  scheduledRetryAttempt?: number | null;
  scheduledRetryReason?: string | null;
  retryExhaustedReason?: string | null;
};

export type RunRetryStateSummary = {
  kind: "scheduled" | "exhausted" | "attempted";
  badgeLabel: string;
  tone: string;
  detail: string | null;
  secondary: string | null;
  retryOfRunId: string | null;
};

const RETRY_REASON_LABELS: Record<string, string> = {
  transient_failure: "Transient failure",
  missing_issue_comment: "Missing task comment",
  process_lost: "Process lost",
  assignment_recovery: "Assignment recovery",
  issue_continuation_needed: "Continuation needed",
  max_turns_continuation: "Max-turn continuation",
};

const RETRY_REASON_KEYS: Record<string, string> = {
  transient_failure: "runRetryState.reason.transientFailure",
  missing_issue_comment: "runRetryState.reason.missingIssueComment",
  process_lost: "runRetryState.reason.processLost",
  assignment_recovery: "runRetryState.reason.assignmentRecovery",
  issue_continuation_needed: "runRetryState.reason.issueContinuationNeeded",
  max_turns_continuation: "runRetryState.reason.maxTurnsContinuation",
};

function translate(
  t: TFunction | undefined,
  key: string,
  defaultValue: string,
  options: Record<string, unknown> = {},
) {
  if (t) return t(key, { ...options, defaultValue });
  return defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, token) => String(options[token] ?? ""));
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function joinFragments(parts: Array<string | null>) {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(" · ") : null;
}

export function formatRetryReason(reason: string | null | undefined, t?: TFunction) {
  const normalized = readNonEmptyString(reason);
  if (!normalized) return null;
  const label = RETRY_REASON_LABELS[normalized];
  if (!label) return normalized.replace(/_/g, " ");
  return translate(t, RETRY_REASON_KEYS[normalized] ?? normalized, label);
}

export function describeRunRetryState(run: RetryAwareRun, t?: TFunction): RunRetryStateSummary | null {
  const attempt =
    typeof run.scheduledRetryAttempt === "number" && Number.isFinite(run.scheduledRetryAttempt) && run.scheduledRetryAttempt > 0
      ? run.scheduledRetryAttempt
      : null;
  const attemptLabel = attempt
    ? translate(t, "issueScheduledRetry.attempt", "Attempt {{count}}", { count: attempt })
    : null;
  const reasonLabel = formatRetryReason(run.scheduledRetryReason, t);
  const retryOfRunId = readNonEmptyString(run.retryOfRunId);
  const exhaustedReason = readNonEmptyString(run.retryExhaustedReason);
  const dueAt = run.scheduledRetryAt ? formatDateTime(run.scheduledRetryAt) : null;
  const isMaxTurnContinuation = run.scheduledRetryReason === "max_turns_continuation";
  const hasRetryMetadata =
    Boolean(retryOfRunId)
    || Boolean(reasonLabel)
    || Boolean(dueAt)
    || Boolean(attemptLabel)
    || Boolean(exhaustedReason);

  if (!hasRetryMetadata) return null;

  if (run.status === "scheduled_retry") {
    return {
      kind: "scheduled",
      badgeLabel: isMaxTurnContinuation
        ? translate(t, "issueScheduledRetry.badge.continuationScheduled", "Continuation scheduled")
        : translate(t, "issueScheduledRetry.badge.retryScheduled", "Retry scheduled"),
      tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
      detail: joinFragments([attemptLabel, reasonLabel]),
      secondary: dueAt
        ? isMaxTurnContinuation
          ? translate(t, "runRetryState.nextContinuationAt", "Next continuation {{date}}", { date: dueAt })
          : translate(t, "runRetryState.nextRetryAt", "Next retry {{date}}", { date: dueAt })
        : isMaxTurnContinuation
          ? translate(t, "runRetryState.nextContinuationPending", "Next continuation pending schedule")
          : translate(t, "runRetryState.nextRetryPending", "Next retry pending schedule"),
      retryOfRunId,
    };
  }

  if (exhaustedReason) {
    return {
      kind: "exhausted",
      badgeLabel: isMaxTurnContinuation
        ? translate(t, "runRetryState.continuationExhausted", "Continuation exhausted")
        : translate(t, "runRetryState.retryExhausted", "Retry exhausted"),
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      detail: joinFragments([
        attemptLabel,
        reasonLabel,
        translate(t, "runRetryState.automaticRetriesExhausted", "Automatic retries exhausted"),
      ]),
      secondary: exhaustedReason.includes("Manual intervention required")
        ? exhaustedReason
        : translate(t, "runRetryState.manualInterventionRequired", "{{reason}} Manual intervention required.", {
            reason: exhaustedReason,
          }),
      retryOfRunId,
    };
  }

  return {
    kind: "attempted",
    badgeLabel: isMaxTurnContinuation
      ? translate(t, "runRetryState.continuedRun", "Continued run")
      : translate(t, "runRetryState.retriedRun", "Retried run"),
    tone: "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    detail: joinFragments([attemptLabel, reasonLabel]),
    secondary: null,
    retryOfRunId,
  };
}
