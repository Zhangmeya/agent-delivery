import type { TFunction } from "i18next";
import { translateStatusLabel } from "./i18n-labels";

type TranslationEntry = {
  key: string;
  defaultValue: string;
};

const SYSTEM_GENERATED_TEXT: Record<string, TranslationEntry> = {
  "Critical output silence threshold crossed.": {
    key: "systemGenerated.outputSilence.criticalThresholdCrossed",
    defaultValue: "Critical output silence threshold crossed.",
  },
  "Paperclip detected suspicious output silence on an active heartbeat run.": {
    key: "systemGenerated.outputSilence.detectedSuspiciousActiveHeartbeatRun",
    defaultValue: "Paperclip detected suspicious output silence on an active heartbeat run.",
  },
  "Paperclip detected critical output silence on an active heartbeat run.": {
    key: "systemGenerated.outputSilence.detectedCriticalActiveHeartbeatRun",
    defaultValue: "Paperclip detected critical output silence on an active heartbeat run.",
  },
  "Paperclip detected critical output silence on this issue's active run.": {
    key: "systemGenerated.outputSilence.detectedOnActiveRun",
    defaultValue: "Paperclip detected critical output silence on this issue's active run.",
  },
  "This blocks the source issue on the explicit review task without cancelling the active process.": {
    key: "systemGenerated.outputSilence.blocksSourceIssue",
    defaultValue: "This blocks the source issue on the explicit review task without cancelling the active process.",
  },
  "Queued automatic retry after orphaned child process was confirmed dead": {
    key: "systemGenerated.runEvent.queuedRetryAfterOrphanedProcess",
    defaultValue: "Queued automatic retry after orphaned child process was confirmed dead",
  },
  "Cancelled because issue dependencies are still blocked; Paperclip will wake the assignee when blockers resolve": {
    key: "systemGenerated.runEvent.cancelledDependenciesBlocked",
    defaultValue: "Cancelled because issue dependencies are still blocked; Paperclip will wake the assignee when blockers resolve",
  },
  "Scheduled retry suppressed because issue dependencies are still blocked": {
    key: "systemGenerated.runEvent.retrySuppressedDependenciesBlocked",
    defaultValue: "Scheduled retry suppressed because issue dependencies are still blocked",
  },
  "Scheduled retry suppressed because the agent is not invokable": {
    key: "systemGenerated.runEvent.retrySuppressedAgentNotInvokable",
    defaultValue: "Scheduled retry suppressed because the agent is not invokable",
  },
  "Scheduled retry suppressed because the target issue no longer exists": {
    key: "systemGenerated.runEvent.retrySuppressedIssueMissing",
    defaultValue: "Scheduled retry suppressed because the target issue no longer exists",
  },
  "Scheduled retry suppressed because issue ownership changed": {
    key: "systemGenerated.runEvent.retrySuppressedOwnershipChanged",
    defaultValue: "Scheduled retry suppressed because issue ownership changed",
  },
  "Scheduled retry suppressed because the issue is waiting on another review participant": {
    key: "systemGenerated.runEvent.retrySuppressedReviewParticipant",
    defaultValue: "Scheduled retry suppressed because the issue is waiting on another review participant",
  },
  "Scheduled retry suppressed because the issue is held by an active subtree pause hold": {
    key: "systemGenerated.runEvent.retrySuppressedPauseHold",
    defaultValue: "Scheduled retry suppressed because the issue is held by an active subtree pause hold",
  },
  "Scheduled retry suppressed because the agent no longer exists": {
    key: "systemGenerated.runEvent.retrySuppressedAgentMissing",
    defaultValue: "Scheduled retry suppressed because the agent no longer exists",
  },
  "Scheduled retry became due and was promoted to the queued run pool": {
    key: "systemGenerated.runEvent.scheduledRetryPromoted",
    defaultValue: "Scheduled retry became due and was promoted to the queued run pool",
  },
  "Scheduled retry was requested to run now": {
    key: "systemGenerated.runEvent.scheduledRetryRequestedNow",
    defaultValue: "Scheduled retry was requested to run now",
  },
  "Scheduled retry was promoted to the queued run pool": {
    key: "systemGenerated.runEvent.scheduledRetryPromotedManual",
    defaultValue: "Scheduled retry was promoted to the queued run pool",
  },
  "Scheduled retry was already promoted": {
    key: "systemGenerated.runEvent.scheduledRetryAlreadyPromoted",
    defaultValue: "Scheduled retry was already promoted",
  },
  "No live scheduled retry exists for this issue": {
    key: "systemGenerated.runEvent.noLiveScheduledRetry",
    defaultValue: "No live scheduled retry exists for this issue",
  },
  "Detached child process reported activity; cleared detached warning": {
    key: "systemGenerated.runEvent.detachedProcessActivityCleared",
    defaultValue: "Detached child process reported activity; cleared detached warning",
  },
  "Run ended without an issue comment after one retry; no further comment wake will be queued": {
    key: "systemGenerated.runEvent.missingCommentRetryExhausted",
    defaultValue: "Run ended without an issue comment after one retry; no further comment wake will be queued",
  },
  "Run ended without an issue comment; a deferred comment wake already exists for this issue": {
    key: "systemGenerated.runEvent.missingCommentDeferredWakeExists",
    defaultValue: "Run ended without an issue comment; a deferred comment wake already exists for this issue",
  },
  "Run ended without an issue comment; queued one follow-up wake to require a comment": {
    key: "systemGenerated.runEvent.missingCommentQueuedFollowUp",
    defaultValue: "Run ended without an issue comment; queued one follow-up wake to require a comment",
  },
  "Max-turn continuation suppressed because the policy is disabled": {
    key: "systemGenerated.runEvent.maxTurnContinuationPolicyDisabled",
    defaultValue: "Max-turn continuation suppressed because the policy is disabled",
  },
  "Cancelled because the target issue no longer exists": {
    key: "systemGenerated.runEvent.cancelledTargetIssueMissing",
    defaultValue: "Cancelled because the target issue no longer exists",
  },
  "run started": {
    key: "systemGenerated.runEvent.runStarted",
    defaultValue: "run started",
  },
  "adapter invocation": {
    key: "systemGenerated.runEvent.adapterInvocation",
    defaultValue: "adapter invocation",
  },
  "run cancelled": {
    key: "systemGenerated.runEvent.runCancelled",
    defaultValue: "run cancelled",
  },
};

const SYSTEM_GENERATED_MARKDOWN_LABELS: Record<string, TranslationEntry> = {
  Run: {
    key: "systemGenerated.label.run",
    defaultValue: "Run",
  },
  Agent: {
    key: "systemGenerated.label.agent",
    defaultValue: "Agent",
  },
  Invocation: {
    key: "systemGenerated.label.invocation",
    defaultValue: "Invocation",
  },
  "Source issue": {
    key: "systemGenerated.label.sourceIssue",
    defaultValue: "Source issue",
  },
  "Started at": {
    key: "systemGenerated.label.startedAt",
    defaultValue: "Started at",
  },
  "Process started at": {
    key: "systemGenerated.label.processStartedAt",
    defaultValue: "Process started at",
  },
  "Last output at": {
    key: "systemGenerated.label.lastOutputAt",
    defaultValue: "Last output at",
  },
  "Last output sequence": {
    key: "systemGenerated.label.lastOutputSequence",
    defaultValue: "Last output sequence",
  },
  "Silent for": {
    key: "systemGenerated.label.silentFor",
    defaultValue: "Silent for",
  },
  Thresholds: {
    key: "systemGenerated.label.thresholds",
    defaultValue: "Thresholds",
  },
  "Process metadata": {
    key: "systemGenerated.label.processMetadata",
    defaultValue: "Process metadata",
  },
  "Evaluation issue": {
    key: "systemGenerated.label.evaluationIssue",
    defaultValue: "Evaluation issue",
  },
};

const SYSTEM_GENERATED_MARKDOWN_HEADINGS: Record<string, TranslationEntry> = {
  Run: {
    key: "systemGenerated.heading.run",
    defaultValue: "Run",
  },
  "Last Output Excerpt": {
    key: "systemGenerated.heading.lastOutputExcerpt",
    defaultValue: "Last Output Excerpt",
  },
  "Recent Run Events": {
    key: "systemGenerated.heading.recentRunEvents",
    defaultValue: "Recent Run Events",
  },
  "Related Work": {
    key: "systemGenerated.heading.relatedWork",
    defaultValue: "Related Work",
  },
  "Decision Checklist": {
    key: "systemGenerated.heading.decisionChecklist",
    defaultValue: "Decision Checklist",
  },
};

export function translateSystemGeneratedText<T extends string | null | undefined>(
  t: TFunction,
  text: T,
): T | string {
  if (typeof text !== "string") return text;
  const trimmed = text.trim();
  if (!trimmed) return text;

  const exact = SYSTEM_GENERATED_TEXT[trimmed];
  if (exact) return t(exact.key, { defaultValue: exact.defaultValue });

  const terminalStatusMatch = /^Scheduled retry suppressed because issue reached terminal status \(([^)]+)\)$/.exec(trimmed);
  if (terminalStatusMatch) {
    const status = terminalStatusMatch[1] ?? "";
    return t("systemGenerated.runEvent.retrySuppressedTerminalStatus", {
      status: translateStatusLabel(t, status),
      defaultValue: `Scheduled retry suppressed because issue reached terminal status (${status})`,
    });
  }

  const cancelledTerminalStatusMatch = /^Cancelled because issue reached terminal status \(([^)]+)\) before the queued run could start$/.exec(trimmed);
  if (cancelledTerminalStatusMatch) {
    const status = cancelledTerminalStatusMatch[1] ?? "";
    return t("systemGenerated.runEvent.cancelledTerminalStatusBeforeStart", {
      status: translateStatusLabel(t, status),
      defaultValue: `Cancelled because issue reached terminal status (${status}) before the queued run could start`,
    });
  }

  const notInProgressMatch = /^Scheduled max-turn continuation suppressed because issue is no longer in_progress \(current status: ([^)]+)\)$/.exec(trimmed);
  if (notInProgressMatch) {
    const status = notInProgressMatch[1] ?? "";
    return t("systemGenerated.runEvent.maxTurnSuppressedIssueNotInProgress", {
      status: translateStatusLabel(t, status),
      defaultValue: `Scheduled max-turn continuation suppressed because issue is no longer in_progress (current status: ${status})`,
    });
  }

  return text;
}

export function translateSystemGeneratedMarkdownText(text: string, t: TFunction): string {
  if (!text) return text;
  if (!isKnownSystemGeneratedMarkdown(text)) return text;
  let changed = false;
  const lines = text.split(/\r?\n/).map((line) => {
    const translated = translateSystemGeneratedMarkdownLine(line, t);
    if (translated !== line) changed = true;
    return translated;
  });
  return changed ? lines.join("\n") : text;
}

export function isKnownSystemGeneratedMarkdown(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (matchesKnownSystemGeneratedText(trimmed)) return true;
  return Object.keys(SYSTEM_GENERATED_TEXT).some((needle) => text.includes(needle));
}

function matchesKnownSystemGeneratedText(text: string): boolean {
  if (SYSTEM_GENERATED_TEXT[text]) return true;
  if (/^Scheduled retry suppressed because issue reached terminal status \(([^)]+)\)$/.test(text)) return true;
  if (/^Cancelled because issue reached terminal status \(([^)]+)\) before the queued run could start$/.test(text)) return true;
  return /^Scheduled max-turn continuation suppressed because issue is no longer in_progress \(current status: ([^)]+)\)$/.test(text);
}

function translateSystemGeneratedMarkdownLine(line: string, t: TFunction): string {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  const trimmed = line.trim();
  if (!trimmed) return line;

  const translatedExact = translateSystemGeneratedText(t, trimmed);
  if (translatedExact !== trimmed) return `${leading}${translatedExact}`;

  const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
  if (headingMatch) {
    const [, marks, heading] = headingMatch;
    const entry = heading ? SYSTEM_GENERATED_MARKDOWN_HEADINGS[heading] : undefined;
    if (entry) return `${leading}${marks} ${t(entry.key, { defaultValue: entry.defaultValue })}`;
  }

  const bulletMatch = /^([-*]\s+)([^:]+):\s*(.*)$/.exec(trimmed);
  if (bulletMatch) {
    const [, bullet, label, value] = bulletMatch;
    const entry = label ? SYSTEM_GENERATED_MARKDOWN_LABELS[label] : undefined;
    if (!entry) return line;
    const translatedLabel = t(entry.key, { defaultValue: entry.defaultValue });
    const translatedValue = translateSystemGeneratedMarkdownValue(label, value ?? "", t);
    const separator = translatedLabel === label ? ": " : "：";
    return `${leading}${bullet}${translatedLabel}${separator}${translatedValue}`;
  }

  return line;
}

function translateSystemGeneratedMarkdownValue(label: string, value: string, t: TFunction): string {
  const trimmed = value.trim();
  if (label === "Silent for") return translateSystemGeneratedDuration(t, trimmed);
  if (trimmed === "none recorded") {
    return t("systemGenerated.value.noneRecorded", { defaultValue: "none recorded" });
  }
  return value;
}

export function translateSystemGeneratedDuration(t: TFunction, value: string): string {
  const match = /^(\d+(?:\.\d+)?)([dhms])$/.exec(value.trim());
  if (!match) return value;
  const amount = match[1] ?? "";
  const unit = match[2];
  switch (unit) {
    case "d":
      return t("systemGenerated.duration.days", { count: amount, defaultValue: `${amount}d` });
    case "h":
      return t("systemGenerated.duration.hours", { count: amount, defaultValue: `${amount}h` });
    case "m":
      return t("systemGenerated.duration.minutes", { count: amount, defaultValue: `${amount}m` });
    case "s":
      return t("systemGenerated.duration.seconds", { count: amount, defaultValue: `${amount}s` });
    default:
      return value;
  }
}
