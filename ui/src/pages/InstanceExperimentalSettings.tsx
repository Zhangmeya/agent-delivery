import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, FlaskConical, Play, Search } from "lucide-react";
import type {
  InstanceExperimentalSettings,
  IssueGraphLivenessAutoRecoveryPreview,
  PatchInstanceExperimentalSettings,
} from "@penclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { getWorktreeInstanceId, isWorktreeRuntime } from "../lib/worktree-branding";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function issueHref(identifier: string | null, issueId: string) {
  if (!identifier) return `/issues/${issueId}`;
  const prefix = identifier.split("-")[0] || "PAP";
  return `/${prefix}/issues/${identifier}`;
}

function formatRecoveryState(t: TFunction, state: string) {
  switch (state) {
    case "invalid_review_participant":
      return t("instanceExperimentalSettings.recoveryState.invalidReviewParticipant", {
        defaultValue: "Invalid review participant",
      });
    case "in_review_without_action_path":
      return t("instanceExperimentalSettings.recoveryState.inReviewWithoutActionPath", {
        defaultValue: "In review without an action path",
      });
    case "blocked_by_cancelled_issue":
      return t("instanceExperimentalSettings.recoveryState.blockedByCancelledIssue", {
        defaultValue: "Blocked by a cancelled task",
      });
    case "blocked_by_assigned_backlog_issue":
      return t("instanceExperimentalSettings.recoveryState.blockedByAssignedBacklogIssue", {
        defaultValue: "Blocked by an assigned backlog task",
      });
    case "blocked_by_unassigned_issue":
      return t("instanceExperimentalSettings.recoveryState.blockedByUnassignedIssue", {
        defaultValue: "Blocked by an unassigned task",
      });
    case "blocked_by_uninvokable_assignee":
      return t("instanceExperimentalSettings.recoveryState.blockedByUninvokableAssignee", {
        defaultValue: "Blocked by an unavailable assignee",
      });
    default:
      return state.replace(/_/g, " ");
  }
}

type WorktreeRunExecutionDisplayState =
  | { kind: "off" }
  | { kind: "armed"; activatedAt: string }
  | { kind: "fail_closed"; reason: "missing_cutoff" | "missing_instance_id" | "instance_mismatch" };

/**
 * Mirror of the server's `resolveWorktreeRunExecutionActivation` fail-closed
 * ladder (server/src/services/instance-settings.ts) so the card never claims a
 * copied/legacy row is arming execution. The derived fields are display-only —
 * the PATCH the toggle sends still writes just the boolean.
 */
function resolveWorktreeRunExecutionDisplayState(
  settings:
    | Pick<
        InstanceExperimentalSettings,
        | "enableWorktreeRunExecution"
        | "worktreeRunExecutionActivatedAt"
        | "worktreeRunExecutionActivationInstanceId"
      >
    | undefined,
  currentInstanceId: string | null,
): WorktreeRunExecutionDisplayState {
  if (settings?.enableWorktreeRunExecution !== true) return { kind: "off" };
  if (!settings.worktreeRunExecutionActivatedAt) return { kind: "fail_closed", reason: "missing_cutoff" };
  if (!currentInstanceId) return { kind: "fail_closed", reason: "missing_instance_id" };
  if (settings.worktreeRunExecutionActivationInstanceId !== currentInstanceId) {
    return { kind: "fail_closed", reason: "instance_mismatch" };
  }
  return { kind: "armed", activatedAt: settings.worktreeRunExecutionActivatedAt };
}

function formatActivationTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// PAP-11233: keep Conference Room code intact, but hide the user-facing opt-in for now.
const SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING = false;

function RecoveryPreviewDialog({
  preview,
  open,
  onOpenChange,
  onEnableOnly,
  onEnableAndRun,
  isPending,
}: {
  preview: IssueGraphLivenessAutoRecoveryPreview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnableOnly: () => void;
  onEnableAndRun: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const count = preview?.recoverableFindings ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("instanceExperimentalSettings.confirmAutoRecovery", { defaultValue: "Confirm auto-recovery" })}</DialogTitle>
          <DialogDescription>
            {preview
              ? t("instanceExperimentalSettings.recoveryPreviewSummary", {
                defaultValue: "{{count}} recovery tasks match the last {{hours}} hours.",
                count,
                hours: preview.lookbackHours,
              })
              : t("instanceExperimentalSettings.checkingRecoveryCandidates", { defaultValue: "Checking recovery candidates before enabling." })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-(--sz-calc-36) space-y-3 overflow-y-auto pr-1">
          {preview && preview.items.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.noRecoveryTasksNow", {
                defaultValue: "No recovery tasks would be created right now. Auto-recovery can still run for future liveness incidents in this window.",
              })}
            </div>
          ) : null}

          {preview?.items.map((item) => (
            <Card key={item.incidentKey} className="block px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={issueHref(item.identifier, item.issueId)}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  {item.identifier ?? item.issueId}
                </a>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {formatRecoveryState(t, item.state)}
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              <div className="mt-2 text-xs text-muted-foreground">
                {t("instanceExperimentalSettings.recoveryTarget", { defaultValue: "Recovery target:" })}{" "}
                <a
                  href={issueHref(item.recoveryIdentifier, item.recoveryIssueId)}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {item.recoveryIdentifier ?? item.recoveryIssueId}
                </a>
              </div>
            </Card>
          ))}
        </div>

        {preview && preview.skippedOutsideLookback > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("instanceExperimentalSettings.skippedOutsideLookback", {
              defaultValue: "{{count}} current findings are outside the configured lookback and will not be touched.",
              count: preview.skippedOutsideLookback,
            })}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("Cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button variant="outline" onClick={onEnableOnly} disabled={isPending || !preview}>
            {t("instanceExperimentalSettings.enableOnly", { defaultValue: "Enable only" })}
          </Button>
          <Button onClick={onEnableAndRun} disabled={isPending || !preview}>
            {count > 0
              ? t("instanceExperimentalSettings.enableAndCreate", { defaultValue: "Enable and create {{count}}", count })
              : t("Enable", { defaultValue: "Enable" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InstanceExperimentalSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [lookbackHoursDraft, setLookbackHoursDraft] = useState("24");
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<IssueGraphLivenessAutoRecoveryPreview | null>(null);

  function closeRecoveryPreview() {
    setPreviewDialogOpen(false);
    setPendingPreview(null);
  }

  useEffect(() => {
    setBreadcrumbs([
      { label: t("Settings", { defaultValue: "Settings" }), href: "/company/settings" },
      { label: t("Instance settings", { defaultValue: "Instance settings" }), href: "/company/settings/instance/general" },
      { label: t("Experimental", { defaultValue: "Experimental" }) },
    ]);
  }, [setBreadcrumbs, t]);

  const experimentalQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const toggleMutation = useMutation<
    InstanceExperimentalSettings,
    Error,
    PatchInstanceExperimentalSettings,
    { previousSettings?: InstanceExperimentalSettings }
  >({
    mutationFn: async (patch: PatchInstanceExperimentalSettings) =>
      instanceSettingsApi.updateExperimental(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.instance.experimentalSettings });
      const previousSettings = queryClient.getQueryData<InstanceExperimentalSettings>(
        queryKeys.instance.experimentalSettings,
      );
      if (previousSettings) {
        queryClient.setQueryData<InstanceExperimentalSettings>(
          queryKeys.instance.experimentalSettings,
          { ...previousSettings, ...patch },
        );
      }
      return { previousSettings };
    },
    onSuccess: async (updatedSettings) => {
      setActionError(null);
      queryClient.setQueryData(queryKeys.instance.experimentalSettings, updatedSettings);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: ["built-in-agents"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
    onError: (error, _patch, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.instance.experimentalSettings, context.previousSettings);
      }
      setActionError(error instanceof Error ? error.message : t("instanceExperimentalSettings.updateFailed", { defaultValue: "Failed to update experimental settings." }));
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (lookbackHours: number) =>
      instanceSettingsApi.previewIssueGraphLivenessAutoRecovery({ lookbackHours }),
    onSuccess: (preview) => {
      setActionError(null);
      setPendingPreview(preview);
      setPreviewDialogOpen(true);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("instanceExperimentalSettings.previewFailed", { defaultValue: "Failed to preview recovery tasks." }));
    },
  });

  const runRecoveryMutation = useMutation({
    mutationFn: async (lookbackHours: number) =>
      instanceSettingsApi.runIssueGraphLivenessAutoRecovery({ lookbackHours }),
    onSuccess: async () => {
      setActionError(null);
      closeRecoveryPreview();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("instanceExperimentalSettings.createRecoveryTasksFailed", { defaultValue: "Failed to create recovery tasks." }));
    },
  });

  useEffect(() => {
    const next = experimentalQuery.data?.issueGraphLivenessAutoRecoveryLookbackHours;
    if (typeof next === "number") {
      setLookbackHoursDraft(String(next));
    }
  }, [experimentalQuery.data?.issueGraphLivenessAutoRecoveryLookbackHours]);

  if (experimentalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("instanceExperimentalSettings.loading", { defaultValue: "Loading experimental settings..." })}</div>;
  }

  if (experimentalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {experimentalQuery.error instanceof Error
          ? experimentalQuery.error.message
          : t("instanceExperimentalSettings.loadFailed", { defaultValue: "Failed to load experimental settings." })}
      </div>
    );
  }

  const inWorktree = isWorktreeRuntime();
  const enableWorktreeRunExecution = experimentalQuery.data?.enableWorktreeRunExecution === true;
  const worktreeRunExecutionState = resolveWorktreeRunExecutionDisplayState(
    experimentalQuery.data,
    getWorktreeInstanceId(),
  );
  const enableEnvironments = experimentalQuery.data?.enableEnvironments === true;
  const enableIsolatedWorkspaces = experimentalQuery.data?.enableIsolatedWorkspaces === true;
  const enableApps = experimentalQuery.data?.enableApps === true;
  // Streamlined left navigation is now the standard sidebar (PAP-12472); the
  // experimental opt-out was retired, so it no longer surfaces a toggle here.
  const enableConferenceRoomChat = experimentalQuery.data?.enableConferenceRoomChat === true;
  const enableIssuePlanDecompositions =
    experimentalQuery.data?.enableIssuePlanDecompositions === true;
  const enableExperimentalFileViewer =
    experimentalQuery.data?.enableExperimentalFileViewer === true;
  const enableTaskWatchdogs = experimentalQuery.data?.enableTaskWatchdogs === true;
  const enableCloudSync = experimentalQuery.data?.enableCloudSync === true;
  const enableExternalObjects = experimentalQuery.data?.enableExternalObjects === true;
  const enableBuiltInAgents = experimentalQuery.data?.enableBuiltInAgents === true;
  const enableSummaries = experimentalQuery.data?.enableSummaries === true;
  const enableDecisions = experimentalQuery.data?.enableDecisions === true;
  const enableGoalsSidebarLink = experimentalQuery.data?.enableGoalsSidebarLink === true;
  const enableCases = experimentalQuery.data?.enableCases === true;
  const enableServerInfoDebugView = experimentalQuery.data?.enableServerInfoDebugView === true;
  const enableSmokeLab = experimentalQuery.data?.enableSmokeLab === true;
  const autoRestartDevServerWhenIdle = experimentalQuery.data?.autoRestartDevServerWhenIdle === true;
  const enableIssueGraphLivenessAutoRecovery =
    experimentalQuery.data?.enableIssueGraphLivenessAutoRecovery === true;
  const lookbackHours =
    experimentalQuery.data?.issueGraphLivenessAutoRecoveryLookbackHours ?? 24;
  const parsedLookbackHours = Number.parseInt(lookbackHoursDraft, 10);
  const lookbackHoursIsValid =
    Number.isInteger(parsedLookbackHours) && parsedLookbackHours >= 1 && parsedLookbackHours <= 720;
  const recoveryActionPending =
    toggleMutation.isPending || previewMutation.isPending || runRecoveryMutation.isPending;

  function previewForEnable() {
    if (!lookbackHoursIsValid) {
      setActionError(t("instanceExperimentalSettings.lookbackHoursInvalid", { defaultValue: "Lookback hours must be a whole number from 1 to 720." }));
      return;
    }
    closeRecoveryPreview();
    previewMutation.mutate(parsedLookbackHours);
  }

  function enableOnly() {
    if (!lookbackHoursIsValid) return;
    closeRecoveryPreview();
    toggleMutation.mutate({
      enableIssueGraphLivenessAutoRecovery: true,
      issueGraphLivenessAutoRecoveryLookbackHours: parsedLookbackHours,
    });
  }

  function enableAndRun() {
    if (!lookbackHoursIsValid) return;
    closeRecoveryPreview();
    toggleMutation.mutate({
      enableIssueGraphLivenessAutoRecovery: true,
      issueGraphLivenessAutoRecoveryLookbackHours: parsedLookbackHours,
    }, {
      onSuccess: () => runRecoveryMutation.mutate(parsedLookbackHours),
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("Experimental", { defaultValue: "Experimental" })}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("instanceExperimentalSettings.subtitle", { defaultValue: "Opt into features that are still being evaluated before they become default behavior." })}
        </p>
      </div>

      <div
        role="alert"
        className="rounded-lg border border-(--status-task-todo-border) bg-(--status-task-todo-soft) px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-(--status-task-todo)" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{t("instanceExperimentalSettings.warningTitle", { defaultValue: "Experimental features may break at any time." })}</p>
            <p className="text-muted-foreground">
              {t("instanceExperimentalSettings.warningBody", {
                defaultValue: "These features are opt-in and come with no compatibility guarantees. They may change, break, or be removed without notice. Avoid relying on them for critical or production workflows.",
              })}
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {inWorktree ? (
        <Card className="block p-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <h2 className="text-sm font-semibold">
                  {t("instanceExperimentalSettings.worktreeRunExecutionTitle", {
                    defaultValue: "Run tasks in this worktree",
                  })}
                </h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {t("instanceExperimentalSettings.worktreeRunExecutionDescription", {
                    defaultValue:
                      "This is an isolated git-worktree preview instance. Turn this on to let the scheduler execute runs here. Only tasks created after enabling will run automatically; copied or pre-existing tasks stay parked. Toggling off and on resets the cutoff.",
                  })}
                </p>
              </div>
              <ToggleSwitch
                checked={enableWorktreeRunExecution}
                onCheckedChange={(checked) =>
                  toggleMutation.mutate({ enableWorktreeRunExecution: checked })
                }
                disabled={toggleMutation.isPending}
                aria-label={t("instanceExperimentalSettings.worktreeRunExecutionToggle", {
                  defaultValue: "Toggle worktree run execution setting",
                })}
              />
            </div>

            {worktreeRunExecutionState.kind === "armed" ? (
              <div className="flex items-center gap-2 rounded-md border border-(--status-task-done-border) bg-(--status-task-done-soft) px-3 py-2 text-sm text-foreground">
                <Play className="h-4 w-4 shrink-0 text-(--status-task-done)" />
                <span>
                  {t("instanceExperimentalSettings.worktreeRunExecutionArmed", {
                    defaultValue: "Running tasks created after {{timestamp}}.",
                    timestamp: formatActivationTimestamp(worktreeRunExecutionState.activatedAt),
                  })}
                </span>
              </div>
            ) : null}

            {worktreeRunExecutionState.kind === "fail_closed" ? (
              <div className="flex items-start gap-2 rounded-md border border-(--status-task-todo-border) bg-(--status-task-todo-soft) px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-(--status-task-todo)" />
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">
                    {t("instanceExperimentalSettings.worktreeRunExecutionSuppressedTitle", {
                      defaultValue: "Execution is suppressed; this setting is effectively off.",
                    })}
                  </p>
                  <p className="text-muted-foreground">
                    {worktreeRunExecutionState.reason === "instance_mismatch"
                      ? t("instanceExperimentalSettings.worktreeRunExecutionInstanceMismatch", {
                          defaultValue: "This setting was armed in a different instance and copied here, so no tasks run automatically.",
                        })
                      : worktreeRunExecutionState.reason === "missing_instance_id"
                        ? t("instanceExperimentalSettings.worktreeRunExecutionMissingInstanceId", {
                            defaultValue: "This preview instance has no stable instance ID, so no tasks run automatically.",
                          })
                        : t("instanceExperimentalSettings.worktreeRunExecutionMissingCutoff", {
                            defaultValue: "This setting is missing its activation cutoff, so no tasks run automatically.",
                          })}{" "}
                    {t("instanceExperimentalSettings.worktreeRunExecutionRearm", {
                      defaultValue: "Toggle it off and back on to arm execution for tasks created here.",
                    })}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">
                {t("instanceExperimentalSettings.appsTitle", { defaultValue: "Apps" })}
              </h2>
              <Badge variant="secondary">{t("Experimental", { defaultValue: "Experimental" })}</Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.appsDescription", {
                defaultValue: "Show the Apps navigation and allow access to app connections, gateways, and advanced app tooling.",
              })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableApps}
            onCheckedChange={() => toggleMutation.mutate({ enableApps: !enableApps })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.appsToggle", { defaultValue: "Toggle apps experimental setting" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">
                {t("instanceExperimentalSettings.casesTitle", { defaultValue: "Cases" })}
              </h2>
              <Badge variant="secondary">{t("Experimental", { defaultValue: "Experimental" })}</Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.casesDescription", {
                defaultValue:
                  "Durable work products such as blog posts and tweet storms that tasks create and iterate on. Adds the Cases tab and the agent case API.",
              })}
            </p>
            <p className="max-w-2xl text-xs text-muted-foreground">
              {t("instanceExperimentalSettings.casesDisabledDescription", {
                defaultValue: "Turning Cases off hides the tab and blocks the case API; existing case data is kept.",
              })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableCases}
            onCheckedChange={() => toggleMutation.mutate({ enableCases: !enableCases })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.casesToggle", {
              defaultValue: "Toggle cases experimental setting",
            })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.environmentsTitle", { defaultValue: "Enable Environments" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.environmentsDescription", { defaultValue: "Show environment management in company settings and allow project and agent environment assignment controls." })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableEnvironments}
            onCheckedChange={() => toggleMutation.mutate({ enableEnvironments: !enableEnvironments })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.environmentsToggle", { defaultValue: "Toggle environments experimental setting" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              {t("instanceExperimentalSettings.builtInAgentsTitle", { defaultValue: "Built-in Agents" })}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.builtInAgentsDescription", {
                defaultValue:
                  "Show Paperclip CN-managed built-in agent surfaces, including roster badges, the Built-in agents tab, and setup controls.",
              })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableBuiltInAgents}
            onCheckedChange={() => toggleMutation.mutate({ enableBuiltInAgents: !enableBuiltInAgents })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.builtInAgentsToggle", {
              defaultValue: "Toggle built-in agents experimental setting",
            })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              {t("instanceExperimentalSettings.summariesTitle", { defaultValue: "Summaries" })}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.summariesDescription", {
                defaultValue:
                  "Show Summarizer-generated status slots on project and workspace pages, with on-demand refresh and revision history. Existing summary data is kept when this is disabled.",
              })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableSummaries}
            onCheckedChange={() => toggleMutation.mutate({ enableSummaries: !enableSummaries })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.summariesToggle", {
              defaultValue: "Toggle summaries experimental setting",
            })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.fileViewerTitle", { defaultValue: "Experimental File Viewer" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.fileViewerDescription", { defaultValue: "Show task detail controls for browsing and previewing workspace files relative to a task." })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableExperimentalFileViewer}
            onCheckedChange={() =>
              toggleMutation.mutate({
                enableExperimentalFileViewer: !enableExperimentalFileViewer,
              })
            }
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.fileViewerToggle", { defaultValue: "Toggle experimental file viewer setting" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              {t("instanceExperimentalSettings.externalObjectsTitle", { defaultValue: "Enable External Objects" })}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.externalObjectsDescription", {
                defaultValue:
                  "Detect external URLs in tasks and show resolved status for pull requests, tickets, and other referenced work objects.",
              })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableExternalObjects}
            onCheckedChange={() => toggleMutation.mutate({ enableExternalObjects: !enableExternalObjects })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.externalObjectsToggle", { defaultValue: "Toggle external objects experimental setting" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              {t("instanceExperimentalSettings.decisionsTitle", { defaultValue: "Decisions" })}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.decisionsDescription", {
                defaultValue:
                  "Show the Decisions item in the main sidebar, the attention home that surfaces tasks awaiting your input, while the surface is still being evaluated.",
              })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableDecisions}
            onCheckedChange={() => toggleMutation.mutate({ enableDecisions: !enableDecisions })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.decisionsToggle", {
              defaultValue: "Toggle decisions experimental setting",
            })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              {t("instanceExperimentalSettings.goalsSidebarLinkTitle", { defaultValue: "Goals Sidebar Link" })}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.goalsSidebarLinkDescription", {
                defaultValue: "Restore the Goals item in the main sidebar while the goals surface is being evaluated.",
              })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableGoalsSidebarLink}
            onCheckedChange={() => toggleMutation.mutate({ enableGoalsSidebarLink: !enableGoalsSidebarLink })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.goalsSidebarLinkToggle", {
              defaultValue: "Toggle goals sidebar link experimental setting",
            })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.isolatedWorkspacesTitle", { defaultValue: "Enable Isolated Workspaces" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.isolatedWorkspacesDescription", { defaultValue: "Show execution workspace controls in project configuration and allow isolated workspace behavior for new and existing task runs." })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableIsolatedWorkspaces}
            onCheckedChange={() => toggleMutation.mutate({ enableIsolatedWorkspaces: !enableIsolatedWorkspaces })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.isolatedWorkspacesToggle", { defaultValue: "Toggle isolated workspaces experimental setting" })}
          />
        </div>
      </Card>

      {SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING ? (
        <Card className="block p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.conferenceRoomTitle", { defaultValue: "Conference Room Chat" })}</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t("instanceExperimentalSettings.conferenceRoomDescription", { defaultValue: "Adds a Conference Room — one chat where you and your whole team work together — plus the live activity feed and the redesigned onboarding. Also restyles task threads as chat bubbles. Turn off anytime to restore the classic UI." })}
              </p>
            </div>
            <ToggleSwitch
              checked={enableConferenceRoomChat}
              onCheckedChange={() =>
                toggleMutation.mutate({
                  enableConferenceRoomChat: !enableConferenceRoomChat,
                })
              }
              disabled={toggleMutation.isPending}
              aria-label={t("instanceExperimentalSettings.conferenceRoomToggle", { defaultValue: "Toggle conference room chat experimental setting" })}
            />
          </div>
        </Card>
      ) : null}

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.issuePlanDecompositionPanelTitle", { defaultValue: "Task Plan Decomposition Panel" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.issuePlanDecompositionPanelDescription", { defaultValue: "Show accepted-plan decomposition history on task detail pages. Intended for debugging and validating subtask creation behavior while the presentation is still being refined." })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableIssuePlanDecompositions}
            onCheckedChange={() =>
              toggleMutation.mutate({
                enableIssuePlanDecompositions: !enableIssuePlanDecompositions,
              })
            }
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.issuePlanDecompositionPanelToggle", { defaultValue: "Toggle task plan decomposition panel experimental setting" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.taskWatchdogsTitle", { defaultValue: "Task Watchdogs" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.taskWatchdogsDescription", { defaultValue: "Show task detail controls for configuring watchdog agents that verify stopped task subtrees and restore live paths when work should continue." })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableTaskWatchdogs}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({
                enableTaskWatchdogs: checked,
              })
            }
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.taskWatchdogsToggle", { defaultValue: "Toggle task watchdogs experimental setting" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.cloudSyncTitle", { defaultValue: "Cloud Sync" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.cloudSyncDescription", { defaultValue: "Show local Paperclip Cloud upstream connection, preview, push, retry, and activation review surfaces. Saved connections and run history are preserved when this is disabled." })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableCloudSync}
            onCheckedChange={() => toggleMutation.mutate({ enableCloudSync: !enableCloudSync })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.cloudSyncToggle", { defaultValue: "Toggle cloud sync experimental setting" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              {t("instanceExperimentalSettings.serverInfoDebugViewTitle", { defaultValue: "Server Info Debug View" })}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.serverInfoDebugViewDescription", {
                defaultValue: 'Show a "Server" section in the account drawer with the current server restart time and running commit.',
              })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableServerInfoDebugView}
            onCheckedChange={() =>
              toggleMutation.mutate({
                enableServerInfoDebugView: !enableServerInfoDebugView,
              })
            }
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.serverInfoDebugViewToggle", { defaultValue: "Toggle server info debug view experimental setting" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              {t("instanceExperimentalSettings.smokeLabTitle", { defaultValue: "Smoke Lab" })}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.smokeLabDescription", {
                defaultValue:
                  'Add a "Smoke Lab" tab under Apps → Developer and an "Integration smoke" card on the dashboard for exercising every integration path against deterministic local fixtures (fake OAuth provider + loopback MCP servers). Private (non-public) deployments only.',
              })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableSmokeLab}
            onCheckedChange={() => toggleMutation.mutate({ enableSmokeLab: !enableSmokeLab })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.smokeLabToggle", { defaultValue: "Toggle smoke lab experimental setting" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              {t("instanceExperimentalSettings.autoRestartDevServerTitle", { defaultValue: "Auto-Restart Dev Server When Idle" })}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.autoRestartDevServerDescription", { defaultValue: "In `pnpm dev:once`, wait for all queued and running local agent runs to finish, then restart the server automatically when backend changes or migrations make the current boot stale." })}
            </p>
          </div>
          <ToggleSwitch
            checked={autoRestartDevServerWhenIdle}
            onCheckedChange={() => toggleMutation.mutate({ autoRestartDevServerWhenIdle: !autoRestartDevServerWhenIdle })}
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.autoRestartDevServerToggle", { defaultValue: "Toggle guarded dev-server auto-restart" })}
          />
        </div>
      </Card>

      <Card className="block p-5">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.autoCreateRecoveryTasksTitle", { defaultValue: "Auto-Create Recovery Tasks" })}</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t("instanceExperimentalSettings.autoCreateRecoveryTasksDescription", { defaultValue: "Let the heartbeat scheduler create recovery tasks for task dependency chains found inside the configured lookback window." })}
              </p>
            </div>
            <ToggleSwitch
              data-testid="issue-graph-liveness-auto-recovery-toggle"
              checked={enableIssueGraphLivenessAutoRecovery}
              onCheckedChange={() => {
                if (enableIssueGraphLivenessAutoRecovery) {
                  toggleMutation.mutate({ enableIssueGraphLivenessAutoRecovery: false });
                  return;
                }
                previewForEnable();
              }}
              disabled={recoveryActionPending}
              aria-label={t("instanceExperimentalSettings.autoCreateRecoveryTasksToggle", { defaultValue: "Toggle issue graph liveness auto-recovery" })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-(--gtc-35) sm:items-end">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t("instanceExperimentalSettings.lookbackHours", { defaultValue: "Lookback hours" })}
              </span>
              <Input
                type="number"
                min={1}
                max={720}
                step={1}
                value={lookbackHoursDraft}
                onChange={(event) => setLookbackHoursDraft(event.target.value)}
                aria-invalid={!lookbackHoursIsValid}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!lookbackHoursIsValid) {
                    setActionError(t("instanceExperimentalSettings.lookbackHoursInvalid", { defaultValue: "Lookback hours must be a whole number from 1 to 720." }));
                    return;
                  }
                  toggleMutation.mutate({
                    issueGraphLivenessAutoRecoveryLookbackHours: parsedLookbackHours,
                  });
                }}
                disabled={recoveryActionPending || parsedLookbackHours === lookbackHours}
              >
                {t("instanceExperimentalSettings.saveHours", { defaultValue: "Save hours" })}
              </Button>
              <Button
                variant="outline"
                onClick={previewForEnable}
                disabled={recoveryActionPending}
              >
                <Search className="h-4 w-4" />
                {t("Preview", { defaultValue: "Preview" })}
              </Button>
              <Button
                onClick={() => {
                  if (!lookbackHoursIsValid) {
                    setActionError(t("instanceExperimentalSettings.lookbackHoursInvalid", { defaultValue: "Lookback hours must be a whole number from 1 to 720." }));
                    return;
                  }
                  runRecoveryMutation.mutate(parsedLookbackHours);
                }}
                disabled={recoveryActionPending || !enableIssueGraphLivenessAutoRecovery}
              >
                <Play className="h-4 w-4" />
                {t("instanceExperimentalSettings.runNow", { defaultValue: "Run now" })}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("instanceExperimentalSettings.currentWindow", {
              defaultValue: "Current window: last {{count}} hours.",
              count: lookbackHours,
            })}
          </p>
        </div>
      </Card>

      {previewDialogOpen ? (
        <RecoveryPreviewDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              closeRecoveryPreview();
            }
          }}
          preview={pendingPreview}
          onEnableOnly={enableOnly}
          onEnableAndRun={enableAndRun}
          isPending={recoveryActionPending}
        />
      ) : null}
    </div>
  );
}
