import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { IssueBlockerAttention } from "@penclipai/shared";
import { cn } from "../lib/utils";
import { issueStatusIcon, issueStatusIconClassic, issueStatusIconDefault } from "../lib/status-colors";
import { useConferenceRoomChatEnabled } from "../hooks/useConferenceRoomChatEnabled";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { translateStatusLabel } from "../lib/i18n-labels";

const allStatuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];

interface StatusIconProps {
  status: string;
  blockerAttention?: IssueBlockerAttention | null;
  onChange?: (status: string) => void;
  className?: string;
  showLabel?: boolean;
}

function blockedAttentionLabel(t: TFunction, blockerAttention: IssueBlockerAttention | null | undefined) {
  if (!blockerAttention || blockerAttention.state === "none") return translateStatusLabel(t, "blocked");

  if (blockerAttention.reason === "active_child") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return t("statusIcon.blocked.waitingOnActiveSubIssueNamed", {
        defaultValue: "Blocked · waiting on active sub-issue {{identifier}}",
        identifier: blockerAttention.sampleBlockerIdentifier,
      });
    }
    if (count === 1) {
      return t("statusIcon.blocked.waitingOnOneActiveSubIssue", {
        defaultValue: "Blocked · waiting on 1 active sub-issue",
      });
    }
    return t("statusIcon.blocked.waitingOnActiveSubIssues", {
      count,
      defaultValue: "Blocked · waiting on {{count}} active sub-issues",
    });
  }

  if (blockerAttention.reason === "active_dependency") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return t("statusIcon.blocked.coveredByActiveDependencyNamed", {
        defaultValue: "Blocked · covered by active dependency {{identifier}}",
        identifier: blockerAttention.sampleBlockerIdentifier,
      });
    }
    if (count === 1) {
      return t("statusIcon.blocked.coveredByOneActiveDependency", {
        defaultValue: "Blocked · covered by 1 active dependency",
      });
    }
    return t("statusIcon.blocked.coveredByActiveDependencies", {
      count,
      defaultValue: "Blocked · covered by {{count}} active dependencies",
    });
  }

  if (blockerAttention.reason === "stalled_review") {
    const count = blockerAttention.stalledBlockerCount;
    const leaf = blockerAttention.sampleStalledBlockerIdentifier ?? blockerAttention.sampleBlockerIdentifier;
    if (count === 1 && leaf) {
      return t("statusIcon.blocked.reviewStalledOn", {
        defaultValue: "Blocked · review stalled on {{identifier}}",
        identifier: leaf,
      });
    }
    if (count === 1) {
      return t("statusIcon.blocked.oneReviewStalled", {
        defaultValue: "Blocked · review stalled with no clear next step",
      });
    }
    return t("statusIcon.blocked.reviewsStalled", {
      count,
      defaultValue: "Blocked · {{count}} reviews stalled with no clear next step",
    });
  }

  if (blockerAttention.reason === "attention_required") {
    const count = blockerAttention.attentionBlockerCount || blockerAttention.unresolvedBlockerCount;
    const attentionCopy = count === 1
      ? t("statusIcon.blocked.oneBlockerNeedsAttention", {
        defaultValue: "1 blocker needs attention",
      })
      : t("statusIcon.blocked.blockersNeedAttention", {
        count,
        defaultValue: "{{count}} blockers need attention",
      });
    const coveredCount = blockerAttention.coveredBlockerCount;
    if (coveredCount > 0) {
      return t("statusIcon.blocked.attentionAndCovered", {
        attention: attentionCopy,
        coveredCount,
        defaultValue: "Blocked · {{attention}}; {{coveredCount}} covered by active work",
      });
    }
    return t("statusIcon.blocked.attention", {
      attention: attentionCopy,
      defaultValue: "Blocked · {{attention}}",
    });
  }

  return translateStatusLabel(t, "blocked");
}

export function StatusIcon({ status, blockerAttention, onChange, className, showLabel }: StatusIconProps) {
  const { t } = useTranslation(undefined, { useSuspense: false });
  const [open, setOpen] = useState(false);
  // PAP-75 brand hues (todo → amber, in_progress → blue) ship behind the
  // Conference Room Chat flag (PAP-139); OFF keeps master's palette.
  const { enabled: conferenceRoomChatEnabled } = useConferenceRoomChatEnabled();
  const statusIconPalette = conferenceRoomChatEnabled ? issueStatusIcon : issueStatusIconClassic;
  const isCoveredBlocked = status === "blocked" && blockerAttention?.state === "covered";
  const isStalledBlocked = status === "blocked" && blockerAttention?.state === "stalled";
  const isAttentionBlocked = status === "blocked" && blockerAttention?.state === "needs_attention";
  const hasCoveredBlockedWork = isAttentionBlocked && (blockerAttention?.coveredBlockerCount ?? 0) > 0;
  const colorClass = isCoveredBlocked
    ? "text-cyan-600 border-cyan-600 dark:text-cyan-400 dark:border-cyan-400"
    : isStalledBlocked
      ? "text-amber-600 border-amber-600 dark:text-amber-400 dark:border-amber-400"
      : statusIconPalette[status] ?? issueStatusIconDefault;
  const isDone = status === "done";
  const label = status === "blocked" ? blockedAttentionLabel(t, blockerAttention) : translateStatusLabel(t, status);
  const ariaLabel = label;
  const blockerAttentionState = isCoveredBlocked
    ? "covered"
    : isStalledBlocked
      ? "stalled"
      : isAttentionBlocked
        ? "needs_attention"
        : undefined;

  const circle = (
    <span
      className={cn(
        "relative inline-flex h-4 w-4 rounded-full border-2 shrink-0",
        colorClass,
        onChange && !showLabel && "cursor-pointer",
        className
      )}
      data-blocker-attention-state={blockerAttentionState}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {isDone && (
        <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-current" />
      )}
      {isCoveredBlocked && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-current" />
      )}
      {hasCoveredBlockedWork && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-cyan-600 dark:bg-cyan-400" />
      )}
      {isStalledBlocked && (
        <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-current" />
      )}
    </span>
  );

  if (!onChange) return showLabel ? <span className="inline-flex items-center gap-1.5">{circle}<span className="text-sm">{label}</span></span> : circle;

  const trigger = showLabel ? (
    <button className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors">
      {circle}
      <span className="text-sm">{label}</span>
    </button>
  ) : circle;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {allStatuses.map((s) => (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2 text-xs", s === status && "bg-accent")}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
          >
            <StatusIcon status={s} />
            {translateStatusLabel(t, s)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
