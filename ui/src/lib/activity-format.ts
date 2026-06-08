import type { Agent } from "@penclipai/shared";
import { translateInstant } from "../i18n";
import type { CompanyUserProfile } from "./company-members";

type ActivityDetails = Record<string, unknown> | null | undefined;

type ActivityParticipant = {
  type: "agent" | "user";
  agentId?: string | null;
  userId?: string | null;
};

type ActivityIssueReference = {
  id?: string | null;
  identifier?: string | null;
  title?: string | null;
};

interface ActivityFormatOptions {
  agentMap?: Map<string, Agent>;
  userProfileMap?: Map<string, CompanyUserProfile>;
  currentUserId?: string | null;
}

const ACTIVITY_ROW_VERBS: Record<string, string> = {
  "issue.created": "created",
  "issue.updated": "updated",
  "issue.checked_out": "checked out",
  "issue.released": "released",
  "issue.comment_added": "commented on",
  "issue.comment_cancelled": "cancelled a queued comment on",
  "issue.comment_deleted": "deleted a comment on",
  "issue.attachment_added": "attached file to",
  "issue.attachment_removed": "removed attachment from",
  "issue.document_created": "created document for",
  "issue.document_updated": "updated document on",
  "issue.document_locked": "locked document on",
  "issue.document_unlocked": "unlocked document on",
  "issue.document_deleted": "deleted document from",
  "issue.monitor_scheduled": "scheduled monitor on",
  "issue.monitor_triggered": "triggered monitor for",
  "issue.monitor_cleared": "cleared monitor on",
  "issue.monitor_skipped": "skipped monitor for",
  "issue.monitor_exhausted": "exhausted monitor on",
  "issue.monitor_recovery_wake_queued": "queued monitor recovery for",
  "issue.monitor_recovery_issue_created": "created monitor recovery for",
  "issue.monitor_escalated_to_board": "escalated monitor for",
  "issue.commented": "commented on",
  "issue.deleted": "deleted",
  "issue.successful_run_handoff_required": "flagged missing next step on",
  "issue.successful_run_handoff_resolved": "recorded next step chosen on",
  "issue.successful_run_handoff_escalated": "escalated missing next step on",
  "issue.accepted_plan_decomposition_updated": "updated accepted-plan decomposition on",
  "issue.recovery_action_opened": "opened a recovery action on",
  "issue.recovery_action_resolved": "resolved the recovery action on",
  "issue.recovery_action_escalated": "escalated the recovery action on",
  "agent.created": "created",
  "agent.updated": "updated",
  "agent.paused": "paused",
  "agent.resumed": "resumed",
  "agent.error_cleared": "cleared error on",
  "agent.terminated": "terminated",
  "agent.key_created": "created API key for",
  "agent.budget_updated": "updated budget for",
  "agent.runtime_session_reset": "reset session for",
  "heartbeat.invoked": "invoked heartbeat for",
  "heartbeat.cancelled": "cancelled heartbeat for",
  "heartbeat.output_stale_source_resolved": "system-folded stale run on",
  "heartbeat.output_stale_recovery_recursion_refused": "refused recovery-on-recovery for",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
  "project.created": "created",
  "project.updated": "updated",
  "project.deleted": "deleted",
  "goal.created": "created",
  "goal.updated": "updated",
  "goal.deleted": "deleted",
  "cost.reported": "reported cost for",
  "cost.recorded": "recorded cost for",
  "company.created": "created company",
  "company.updated": "updated company",
  "company.archived": "archived",
  "company.reactivated": "reactivated",
  "company.budget_updated": "updated budget for",
};

const ISSUE_ACTIVITY_LABELS: Record<string, string> = {
  "issue.created": "created the issue",
  "issue.updated": "updated the issue",
  "issue.checked_out": "checked out the issue",
  "issue.released": "released the issue",
  "issue.comment_added": "added a comment",
  "issue.comment_cancelled": "cancelled a queued comment",
  "issue.comment_deleted": "deleted a comment",
  "issue.feedback_vote_saved": "saved feedback on an AI output",
  "issue.attachment_added": "added an attachment",
  "issue.attachment_removed": "removed an attachment",
  "issue.document_created": "created a document",
  "issue.document_updated": "updated a document",
  "issue.document_locked": "locked a document",
  "issue.document_unlocked": "unlocked a document",
  "issue.document_deleted": "deleted a document",
  "issue.monitor_scheduled": "scheduled a monitor",
  "issue.monitor_triggered": "triggered a monitor",
  "issue.monitor_cleared": "cleared a monitor",
  "issue.monitor_skipped": "skipped a monitor",
  "issue.monitor_exhausted": "exhausted a monitor",
  "issue.monitor_recovery_wake_queued": "queued a monitor recovery wake",
  "issue.monitor_recovery_issue_created": "created a monitor recovery issue",
  "issue.monitor_escalated_to_board": "escalated a monitor to the board",
  "issue.deleted": "deleted the issue",
  "issue.successful_run_handoff_required": "Run finished without a clear next step",
  "issue.successful_run_handoff_resolved": "Next step chosen",
  "issue.successful_run_handoff_escalated": "Run finished without a next step - recovery escalated",
  "issue.recovery_action_opened": "Opened a source-scoped recovery action",
  "issue.recovery_action_resolved": "Resolved the recovery action",
  "issue.recovery_action_escalated": "Escalated the recovery action",
  "issue.accepted_plan_decomposition_updated": "updated the accepted-plan decomposition",
  "agent.created": "created an agent",
  "agent.updated": "updated the agent",
  "agent.paused": "paused the agent",
  "agent.resumed": "resumed the agent",
  "agent.error_cleared": "cleared the agent error",
  "agent.terminated": "terminated the agent",
  "heartbeat.invoked": "invoked a heartbeat",
  "heartbeat.cancelled": "cancelled a heartbeat",
  "heartbeat.output_stale_source_resolved": "System folded a stale run",
  "heartbeat.output_stale_recovery_recursion_refused": "Refused recovery-on-recovery escalation",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
};

const STATUS_TRANSLATION_KEYS: Record<string, string> = {
  active: "status.active",
  approved: "status.approved",
  archived: "status.archived",
  backlog: "status.backlog",
  blocked: "status.blocked",
  cancelled: "status.cancelled",
  done: "status.done",
  error: "status.error",
  failed: "status.failed",
  queued: "status.queued",
  idle: "status.idle",
  in_progress: "status.inProgress",
  in_review: "status.inReview",
  paused: "status.paused",
  pending: "status.pending",
  pending_approval: "status.pendingApproval",
  rejected: "status.rejected",
  revision_requested: "status.revisionRequested",
  running: "status.running",
  skipped: "status.skipped",
  starting: "status.starting",
  succeeded: "status.succeeded",
  timed_out: "status.timedOut",
  terminated: "status.terminated",
  todo: "status.todo",
};

const PRIORITY_TRANSLATION_KEYS: Record<string, string> = {
  critical: "priority.critical",
  high: "priority.high",
  medium: "priority.medium",
  low: "priority.low",
};

function translateActivityText(
  key: string,
  options?: Record<string, string | number | boolean | null | undefined>,
): string {
  return translateInstant(key, { defaultValue: key, ...options });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return value.replace(/_/g, " ");
}

function humanizeStatusValue(value: unknown): string {
  if (typeof value !== "string") return humanizeValue(value);
  return translateInstant(STATUS_TRANSLATION_KEYS[value] ?? value, { defaultValue: humanizeValue(value) });
}

function humanizePriorityValue(value: unknown): string {
  if (typeof value !== "string") return humanizeValue(value);
  return translateInstant(PRIORITY_TRANSLATION_KEYS[value] ?? value, { defaultValue: humanizeValue(value) });
}

function isActivityParticipant(value: unknown): value is ActivityParticipant {
  const record = asRecord(value);
  if (!record) return false;
  return record.type === "agent" || record.type === "user";
}

function isActivityIssueReference(value: unknown): value is ActivityIssueReference {
  return asRecord(value) !== null;
}

function readParticipants(details: ActivityDetails, key: string): ActivityParticipant[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityParticipant);
}

function readIssueReferences(details: ActivityDetails, key: string): ActivityIssueReference[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityIssueReference);
}

function formatUserLabel(userId: string | null | undefined, options: ActivityFormatOptions = {}): string {
  if (!userId || userId === "local-board") return translateActivityText("Board");
  if (options.currentUserId && userId === options.currentUserId) return translateActivityText("You");
  const profile = options.userProfileMap?.get(userId);
  if (profile) return profile.label;
  return translateInstant("activityFormat.userLabel", {
    id: userId.slice(0, 5),
    defaultValue: `user ${userId.slice(0, 5)}`,
  });
}

function formatParticipantLabel(participant: ActivityParticipant, options: ActivityFormatOptions): string {
  if (participant.type === "agent") {
    const agentId = participant.agentId ?? "";
    return options.agentMap?.get(agentId)?.name ?? translateActivityText("agent");
  }
  return formatUserLabel(participant.userId, options);
}

function formatIssueReferenceLabel(reference: ActivityIssueReference): string {
  if (reference.identifier) return reference.identifier;
  if (reference.title) return reference.title;
  if (reference.id) return reference.id.slice(0, 8);
  return translateActivityText("issue");
}

function formatChangedEntityLabel(
  singular: string,
  plural: string,
  labels: string[],
): string {
  const singularLabel = translateActivityText(singular);
  const pluralLabel = translateActivityText(plural);
  if (labels.length <= 0) return pluralLabel;
  if (labels.length === 1) {
    return translateInstant("activityFormat.namedEntity", {
      entity: singularLabel,
      label: labels[0],
      defaultValue: `${singularLabel} ${labels[0]}`,
    });
  }
  return translateInstant("activityFormat.countedEntity", {
    count: labels.length,
    entity: pluralLabel,
    defaultValue: `${labels.length} ${pluralLabel}`,
  });
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readStringArrayLength(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((entry) => typeof entry === "string" && entry.length > 0).length;
}

function formatAcceptedPlanDecompositionDetail(details: ActivityDetails): string | null {
  if (!details) return null;
  const status = typeof details.status === "string" ? details.status : null;
  const requested = readNumber(details.requestedChildCount);
  const totalChildren = readStringArrayLength(details.childIssueIds);
  const newlyCreated = readStringArrayLength(details.newlyCreatedChildIssueIds);
  const reused = Math.max(0, totalChildren - newlyCreated);
  const parts: string[] = [];
  if (newlyCreated > 0) parts.push(`created ${newlyCreated} new`);
  if (reused > 0) parts.push(`reused ${reused} existing`);
  if (parts.length === 0 && requested !== null) parts.push(`${requested} requested`);
  const summary = parts.length > 0 ? parts.join(", ") : null;
  if (status === "completed" && summary) return `decomposition completed (${summary})`;
  if (status === "completed") return "decomposition completed";
  if (status === "in_flight" && summary) return `decomposition in flight (${summary})`;
  return summary;
}

function formatIssueUpdatedVerb(details: ActivityDetails): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  if (details.status !== undefined) {
    const from = previous.status;
    return from
      ? translateInstant("activityFormat.changedStatusFromOn", {
        from: humanizeStatusValue(from),
        to: humanizeStatusValue(details.status),
        defaultValue: `changed status from ${humanizeStatusValue(from)} to ${humanizeStatusValue(details.status)} on`,
      })
      : translateInstant("activityFormat.changedStatusToOn", {
        status: humanizeStatusValue(details.status),
        defaultValue: `changed status to ${humanizeStatusValue(details.status)} on`,
      });
  }
  if (details.priority !== undefined) {
    const from = previous.priority;
    return from
      ? translateInstant("activityFormat.changedPriorityFromOn", {
        from: humanizePriorityValue(from),
        to: humanizePriorityValue(details.priority),
        defaultValue: `changed priority from ${humanizePriorityValue(from)} to ${humanizePriorityValue(details.priority)} on`,
      })
      : translateInstant("activityFormat.changedPriorityToOn", {
        priority: humanizePriorityValue(details.priority),
        defaultValue: `changed priority to ${humanizePriorityValue(details.priority)} on`,
      });
  }
  return null;
}

function formatAssigneeName(details: ActivityDetails, options: ActivityFormatOptions): string | null {
  if (!details) return null;
  const agentId = details.assigneeAgentId;
  const userId = details.assigneeUserId;
  if (typeof agentId === "string" && agentId) {
    return options.agentMap?.get(agentId)?.name ?? "agent";
  }
  if (typeof userId === "string" && userId) {
    return formatUserLabel(userId, options);
  }
  return null;
}

function formatIssueUpdatedAction(details: ActivityDetails, options: ActivityFormatOptions = {}): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  const parts: string[] = [];

  if (details.status !== undefined) {
    const from = previous.status;
    parts.push(
      from
        ? translateInstant("changed the status from {{from}} to {{to}}", {
          from: humanizeStatusValue(from),
          to: humanizeStatusValue(details.status),
          defaultValue: `changed the status from ${humanizeStatusValue(from)} to ${humanizeStatusValue(details.status)}`,
        })
        : translateInstant("changed the status to {{status}}", {
          status: humanizeStatusValue(details.status),
          defaultValue: `changed the status to ${humanizeStatusValue(details.status)}`,
        }),
    );
  }
  if (details.priority !== undefined) {
    const from = previous.priority;
    parts.push(
      from
        ? translateInstant("changed the priority from {{from}} to {{to}}", {
          from: humanizePriorityValue(from),
          to: humanizePriorityValue(details.priority),
          defaultValue: `changed the priority from ${humanizePriorityValue(from)} to ${humanizePriorityValue(details.priority)}`,
        })
        : translateInstant("changed the priority to {{priority}}", {
          priority: humanizePriorityValue(details.priority),
          defaultValue: `changed the priority to ${humanizePriorityValue(details.priority)}`,
        }),
    );
  }
  if (details.assigneeAgentId !== undefined || details.assigneeUserId !== undefined) {
    const assigneeName = formatAssigneeName(details, options);
    parts.push(
      assigneeName
        ? translateInstant("assigned the issue to {{assignee}}", {
            assignee: assigneeName,
            defaultValue: `assigned the issue to ${assigneeName}`,
          })
        : translateActivityText("unassigned the issue"),
    );
  }
  if (details.title !== undefined) parts.push(translateActivityText("updated the title"));
  if (details.description !== undefined) parts.push(translateActivityText("updated the description"));

  return parts.length > 0 ? parts.join(", ") : null;
}

function formatStructuredIssueChange(input: {
  action: string;
  details: ActivityDetails;
  options: ActivityFormatOptions;
  forIssueDetail: boolean;
}): string | null {
  const details = input.details;
  if (!details) return null;

  if (input.action === "issue.blockers_updated") {
    const added = readIssueReferences(details, "addedBlockedByIssues").map(formatIssueReferenceLabel);
    const removed = readIssueReferences(details, "removedBlockedByIssues").map(formatIssueReferenceLabel);
    if (added.length > 0 && removed.length === 0) {
      const changed = formatChangedEntityLabel("blocker", "blockers", added);
      return input.forIssueDetail
        ? translateInstant("activityFormat.added", {
          changed,
          defaultValue: `added ${changed}`,
        })
        : translateInstant("activityFormat.addedTo", {
          changed,
          defaultValue: `added ${changed} to`,
        });
    }
    if (removed.length > 0 && added.length === 0) {
      const changed = formatChangedEntityLabel("blocker", "blockers", removed);
      return input.forIssueDetail
        ? translateInstant("activityFormat.removed", {
          changed,
          defaultValue: `removed ${changed}`,
        })
        : translateInstant("activityFormat.removedFrom", {
          changed,
          defaultValue: `removed ${changed} from`,
        });
    }
    return input.forIssueDetail
      ? translateInstant("activityFormat.updatedLabel", {
        label: translateActivityText("blockers"),
        defaultValue: "updated blockers",
      })
      : translateInstant("activityFormat.updatedOn", {
        label: translateActivityText("blockers"),
        defaultValue: "updated blockers on",
      });
  }

  if (input.action === "issue.reviewers_updated" || input.action === "issue.approvers_updated") {
    const added = readParticipants(details, "addedParticipants").map((participant) => formatParticipantLabel(participant, input.options));
    const removed = readParticipants(details, "removedParticipants").map((participant) => formatParticipantLabel(participant, input.options));
    const singular = input.action === "issue.reviewers_updated" ? "reviewer" : "approver";
    const plural = input.action === "issue.reviewers_updated" ? "reviewers" : "approvers";
    if (added.length > 0 && removed.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, added);
      return input.forIssueDetail
        ? translateInstant("activityFormat.added", {
          changed,
          defaultValue: `added ${changed}`,
        })
        : translateInstant("activityFormat.addedTo", {
          changed,
          defaultValue: `added ${changed} to`,
        });
    }
    if (removed.length > 0 && added.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, removed);
      return input.forIssueDetail
        ? translateInstant("activityFormat.removed", {
          changed,
          defaultValue: `removed ${changed}`,
        })
        : translateInstant("activityFormat.removedFrom", {
          changed,
          defaultValue: `removed ${changed} from`,
        });
    }
    const translatedPlural = translateActivityText(plural);
    return input.forIssueDetail
      ? translateInstant("activityFormat.updatedLabel", {
        label: translatedPlural,
        defaultValue: `updated ${translatedPlural}`,
      })
      : translateInstant("activityFormat.updatedOn", {
        label: translatedPlural,
        defaultValue: `updated ${translatedPlural} on`,
      });
  }

  return null;
}

export function formatActivityVerb(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
): string {
  if (action === "issue.updated") {
    const issueUpdatedVerb = formatIssueUpdatedVerb(details);
    if (issueUpdatedVerb) return issueUpdatedVerb;
  }

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: false,
  });
  if (structuredChange) return structuredChange;

  const fallback = ACTIVITY_ROW_VERBS[action] ?? action.replace(/[._]/g, " ");
  return translateActivityText(fallback);
}

export function formatIssueActivityAction(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
): string {
  if (action === "issue.updated") {
    const issueUpdatedAction = formatIssueUpdatedAction(details, options);
    if (issueUpdatedAction) return issueUpdatedAction;
  }

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: true,
  });
  if (structuredChange) return structuredChange;

  if (action === "issue.accepted_plan_decomposition_updated") {
    const detail = formatAcceptedPlanDecompositionDetail(details);
    if (detail) return detail;
  }

  if (action.startsWith("issue.monitor_") && details) {
    const serviceName = typeof details.serviceName === "string" && details.serviceName.trim()
      ? details.serviceName.trim()
      : null;
    const base = ISSUE_ACTIVITY_LABELS[action] ?? action.replace(/[._]/g, " ");
    return serviceName ? `${base} for ${serviceName}` : base;
  }

  if (
    (
      action === "issue.document_created" ||
      action === "issue.document_updated" ||
      action === "issue.document_locked" ||
      action === "issue.document_unlocked" ||
      action === "issue.document_deleted"
    ) &&
    details
  ) {
    const key = typeof details.key === "string" ? details.key : "document";
    const title = typeof details.title === "string" && details.title ? ` (${details.title})` : "";
    return `${translateActivityText(ISSUE_ACTIVITY_LABELS[action] ?? action)} ${key}${title}`;
  }

  const fallback = ISSUE_ACTIVITY_LABELS[action] ?? action.replace(/[._]/g, " ");
  return translateActivityText(fallback);
}
