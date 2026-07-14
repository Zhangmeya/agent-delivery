import { AlertTriangle, Info, PauseCircle, User, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { translateStatusLabel } from "../../lib/i18n-labels";
import { AgentIcon } from "../AgentIconPicker";
import {
  classifyAssigneeHandoff,
  resolveRunStatusPresentation,
  type ComposerHandoffPreview,
  type PauseAffectsBucketKey,
  type PauseAffectsSummary,
  type PlainAgentNameCandidate,
  type ReassignInterruptCopy,
  type TimelineAssigneeLike,
} from "../../lib/interrupt-handoff";

/**
 * Presentational views for the interrupt-handoff UX clarity surfaces (PAP-10669).
 * All logic lives in `lib/interrupt-handoff.ts`; these components only render it,
 * so they can be exercised in isolation by component tests and Storybook.
 */

export interface HandoffAgentLike {
  name: string;
  icon?: string | null;
}

export interface HandoffChipResolvers {
  agentMap?: ReadonlyMap<string, HandoffAgentLike> | null;
  resolveUserLabel?: (userId: string) => string | null;
  currentUserId?: string | null;
}

function agentName(agentId: string, resolvers: HandoffChipResolvers): string {
  return resolvers.agentMap?.get(agentId)?.name ?? agentId.slice(0, 8);
}

function agentIcon(agentId: string, resolvers: HandoffChipResolvers): string | null {
  return resolvers.agentMap?.get(agentId)?.icon ?? null;
}

function userLabel(userId: string, resolvers: HandoffChipResolvers): string {
  const label = resolvers.resolveUserLabel?.(userId) ?? null;
  const base = label ?? "Board";
  return resolvers.currentUserId && resolvers.currentUserId === userId ? `${base} (you)` : base;
}

const CHIP_CLASS =
  "inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs";

/** A labelled assignee chip — agent, user, or unassigned — that never lets a
 * user owner read like an agent. */
export function AssigneeChip({
  assignee,
  resolvers,
  className,
}: {
  assignee: TimelineAssigneeLike;
  resolvers: HandoffChipResolvers;
  className?: string;
}) {
  const { t } = useTranslation();
  if (assignee.agentId) {
    return (
      <span className={cn(CHIP_CLASS, className)} data-testid="handoff-assignee-chip" data-kind="agent">
        <span className="sr-only">{t("Agent", { defaultValue: "Agent" })} </span>
        <AgentIcon icon={agentIcon(assignee.agentId, resolvers)} className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="max-w-(--sz-12rem) truncate">{agentName(assignee.agentId, resolvers)}</span>
      </span>
    );
  }
  if (assignee.userId) {
    return (
      <span className={cn(CHIP_CLASS, className)} data-testid="handoff-assignee-chip" data-kind="user">
        <span className="sr-only">{t("User", { defaultValue: "User" })} </span>
        <User className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="max-w-(--sz-12rem) truncate">{userLabel(assignee.userId, resolvers)}</span>
      </span>
    );
  }
  return (
    <span
      className={cn("text-xs italic text-muted-foreground", className)}
      data-testid="handoff-assignee-chip"
      data-kind="unassigned"
    >
      <span className="sr-only">{t("issueChat.noAssignee", { defaultValue: "No responsible" })} - </span>
      {t("Unassigned", { defaultValue: "Unassigned" })}
    </span>
  );
}

/** The "Wake" sub-row that makes each handoff state self-describing: a queued
 * agent wake, a board-user handoff with no wake, or no agent selected. */
export function HandoffWakeRow({
  to,
  resolvers,
  interruptedRunAttached = false,
}: {
  to: TimelineAssigneeLike;
  resolvers: HandoffChipResolvers;
  interruptedRunAttached?: boolean;
}) {
  const { t } = useTranslation();
  const info = classifyAssigneeHandoff(to, {
    agentName: to.agentId ? agentName(to.agentId, resolvers) : null,
    interruptedRunAttached,
  });
  const wakeText =
    info.kind === "agent_wake"
      ? t(
          interruptedRunAttached
            ? "interruptHandoff.wakeQueuedForAgentWithInterruptedRun"
            : "interruptHandoff.wakeQueuedForAgent",
          {
            defaultValue: interruptedRunAttached
              ? "queued for {{agentName}} (interrupted run attached)"
              : "queued for {{agentName}}",
            agentName: to.agentId ? agentName(to.agentId, resolvers) : t("interruptHandoff.assignedAgent", { defaultValue: "the assigned agent" }),
          },
        )
      : info.kind === "user_handoff"
        ? t("interruptHandoff.wakeNotCreatedUser", { defaultValue: "not created - this is a handoff to a board user" })
        : t("interruptHandoff.wakeNotCreatedUnassigned", { defaultValue: "not created - no agent selected. Mention @agent or pick an assignee to dispatch." });
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 text-xs"
      data-testid="handoff-wake-row"
      data-kind={info.kind}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("interruptHandoff.wake", { defaultValue: "Wake" })}
      </span>
      <span className={cn(info.kind === "agent_wake" ? "text-foreground" : "text-muted-foreground")}>
        {wakeText}
      </span>
    </div>
  );
}

/** Run status text that distinguishes an intentional operator interrupt
 * (amber "interrupted") from a generic muted "cancelled". */
export function RunStatusBadge({
  status,
  operatorInterrupted = false,
  className,
}: {
  status: string;
  operatorInterrupted?: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const p = resolveRunStatusPresentation(status, { operatorInterrupted });
  const shouldTranslateStatus = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? false;
  const label =
    status === "cancelled" && operatorInterrupted
      ? t("interruptHandoff.statusInterrupted", { defaultValue: "interrupted" })
      : shouldTranslateStatus
        ? translateStatusLabel(t, status)
        : p.label;
  const srHint =
    p.srHint
      ? t("interruptHandoff.statusInterruptedByBoardComment", { defaultValue: "interrupted by board comment" })
      : null;
  return (
    <span
      className={cn("font-medium", p.className, className)}
      data-testid="run-status-badge"
      data-interrupted={operatorInterrupted ? "true" : "false"}
    >
      {label}
      {srHint ? <span className="sr-only"> - {srHint}</span> : null}
    </span>
  );
}

function PreviewChip({
  chip,
  resolvers,
}: {
  chip: NonNullable<ComposerHandoffPreview["chip"]>;
  resolvers: HandoffChipResolvers;
}) {
  return (
    <AssigneeChip
      assignee={chip.kind === "agent" ? { agentId: chip.id, userId: null } : { agentId: null, userId: chip.id }}
      resolvers={resolvers}
    />
  );
}

/** One-line interpretation of what submitting the comment will durably do. */
export function ComposerHandoffPreviewRow({
  preview,
  resolvers,
}: {
  preview: ComposerHandoffPreview;
  resolvers: HandoffChipResolvers;
}) {
  const { t } = useTranslation();
  if (preview.kind === "none") return null;
  const text =
    preview.kind === "interrupt_handoff_agent"
      ? t("interruptHandoff.previewInterruptHandOff", { defaultValue: "Interrupt current run, hand off to" })
      : preview.kind === "wake_agent"
        ? t("interruptHandoff.wake", { defaultValue: "Wake" })
        : preview.kind === "user_handoff"
          ? t("interruptHandoff.handOffTo", { defaultValue: "Hand off to" })
          : preview.kind === "clear_assignee"
            ? t("interruptHandoff.previewClearAssignee", { defaultValue: "Clear assignee - no agent will be notified" })
            : preview.kind === "notify_agent"
              ? t("interruptHandoff.notify", { defaultValue: "Notify" })
              : preview.kind === "plain_text_only"
                ? t("interruptHandoff.previewPlainTextOnly", { defaultValue: "No agent will be notified. Use @ to mention an agent." })
                : preview.text;
  const suffix =
    preview.kind === "user_handoff"
      ? t("interruptHandoff.noAgentWillBeNotified", { defaultValue: "- no agent will be notified" })
      : preview.kind === "notify_agent" && !preview.chip
        ? t("interruptHandoff.theMentionedAgent", { defaultValue: "the mentioned agent" })
        : preview.suffix;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-1.5 text-xs",
        preview.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
      )}
      data-testid="composer-handoff-preview"
      data-kind={preview.kind}
      role="status"
      aria-live="polite"
    >
      <span>{text}</span>
      {preview.chip ? <PreviewChip chip={preview.chip} resolvers={resolvers} /> : null}
      {suffix ? <span>{suffix}</span> : null}
    </div>
  );
}

/** Inline coach shown when the body contains a plain agent name without a chip,
 * offering a one-click upgrade to a real mention. */
export function ComposerMentionCoach({
  candidate,
  agentDisplayName,
  onInsert,
  onDismiss,
}: {
  candidate: PlainAgentNameCandidate;
  agentDisplayName: string;
  onInsert: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-amber-300/40 bg-amber-50/70 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      data-testid="composer-mention-coach"
      role="alert"
      aria-live="polite"
    >
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {t("interruptHandoff.didYouMeanPrefix", { defaultValue: "Did you mean" })}{" "}
        <span className="font-medium">@{candidate.matchedText}</span>?{" "}
        {t("interruptHandoff.plainTextWillNotNotify", { defaultValue: "Plain text won't notify or assign an agent." })}
      </span>
      <button
        type="button"
        onClick={onInsert}
        className="shrink-0 rounded border border-amber-400/50 px-1.5 py-0.5 font-medium hover:bg-amber-100/60 dark:hover:bg-amber-500/20"
        aria-label={t("interruptHandoff.insertMentionForAgent", {
          defaultValue: "Insert mention for {{agentName}} into your comment",
          agentName: agentDisplayName,
        })}
      >
        {t("interruptHandoff.insertMention", { defaultValue: "Insert mention" })}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 hover:bg-amber-100/60 dark:hover:bg-amber-500/20"
        aria-label={t("interruptHandoff.dismissSuggestion", { defaultValue: "Dismiss suggestion" })}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** Live banner shown at the top of the responsible picker while a run is in flight,
 * warning that reassigning will interrupt it. (design surface 2) */
export function AssigneeRunningBanner({
  copy,
  className,
}: {
  copy: ReassignInterruptCopy;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="assignee-running-banner"
      className={cn(
        "flex items-start gap-1.5 rounded-md border border-amber-300/40 bg-amber-50/70 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{copy.banner}</span>
    </div>
  );
}

/** "Interrupt & assign" confirm step shown when an operator picks a different
 * target while a run is live. (design surface 2) */
export function InterruptAssignConfirm({
  copy,
  to,
  resolvers,
  onConfirm,
  onCancel,
}: {
  copy: ReassignInterruptCopy;
  /** The target the operator selected. */
  to: TimelineAssigneeLike;
  resolvers: HandoffChipResolvers;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="interrupt-assign-confirm"
      className="space-y-2 rounded-md border border-amber-300/40 bg-amber-50/70 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
    >
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{copy.confirmTitle}</p>
          <p className="flex flex-wrap items-center gap-1 text-amber-700/90 dark:text-amber-300/90">
            <span>{t("interruptHandoff.handOffTo", { defaultValue: "Hand off to" })}</span>
            <AssigneeChip assignee={to} resolvers={resolvers} />
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-amber-400/50 px-2 py-0.5 font-medium hover:bg-amber-100/60 dark:hover:bg-amber-500/20"
        >
          {copy.cancelAction}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          data-testid="interrupt-assign-confirm-action"
          className="rounded bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400"
        >
          {copy.confirmAction}
        </button>
      </div>
    </div>
  );
}

/** "What this affects" bucket summary for the pause/hold dialog. (design surface 4) */
export function PauseAffectsSummaryView({
  summary,
  className,
}: {
  summary: PauseAffectsSummary;
  className?: string;
}) {
  const { t } = useTranslation();
  const visibleBuckets = summary.buckets.filter((bucket) => bucket.count > 0);
  const bucketCopy = (key: PauseAffectsBucketKey, part: "label" | "detail") => {
    const fallback = summary.buckets.find((bucket) => bucket.key === key)?.[part] ?? key;
    return t(`interruptHandoff.pauseBucket.${key}.${part}`, { defaultValue: fallback });
  };
  return (
    <div
      data-testid="pause-affects-summary"
      className={cn("space-y-2 rounded-md border border-border bg-muted/30 p-3", className)}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <PauseCircle className="h-3.5 w-3.5" aria-hidden />
        {t("interruptHandoff.whatThisAffects", { defaultValue: "What this affects" })}
      </div>
      {summary.nothingLive ? (
        <p role="status" className="text-xs text-muted-foreground" data-testid="pause-nothing-live">
          {t("interruptHandoff.nothingLiveToPause", {
            defaultValue: "Nothing live to pause - no agent run is in flight or queued. This records a hold so new work won't start until you resume.",
          })}
        </p>
      ) : null}
      {visibleBuckets.length > 0 ? (
        <ul className="space-y-1">
          {visibleBuckets.map((bucket) => (
            <li
              key={bucket.key}
              data-bucket={bucket.key}
              className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs"
            >
              <span className="font-medium text-foreground">{bucketCopy(bucket.key, "label")}:</span>
              <span className="tabular-nums text-foreground">{bucket.count}</span>
              <span className="text-muted-foreground">- {bucketCopy(bucket.key, "detail")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t("interruptHandoff.noTasksAffected", { defaultValue: "No tasks are affected." })}</p>
      )}
    </div>
  );
}
