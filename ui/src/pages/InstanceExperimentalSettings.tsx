import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, FlaskConical, Play, Search } from "lucide-react";
import type {
  InstanceExperimentalSettings,
  IssueGraphLivenessAutoRecoveryPreview,
  PatchInstanceExperimentalSettings,
} from "@penclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Button } from "@/components/ui/button";
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

function formatRecoveryState(state: string) {
  return state.replace(/_/g, " ");
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

        <div className="max-h-[min(28rem,65vh)] space-y-3 overflow-y-auto pr-1">
          {preview && preview.items.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.noRecoveryTasksNow", {
                defaultValue: "No recovery tasks would be created right now. Auto-recovery can still run for future liveness incidents in this window.",
              })}
            </div>
          ) : null}

          {preview?.items.map((item) => (
            <div key={item.incidentKey} className="rounded-md border border-border bg-card px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={issueHref(item.identifier, item.issueId)}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  {item.identifier ?? item.issueId}
                </a>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {formatRecoveryState(item.state)}
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
            </div>
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
      setPreviewDialogOpen(false);
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

  const enableEnvironments = experimentalQuery.data?.enableEnvironments === true;
  const enableIsolatedWorkspaces = experimentalQuery.data?.enableIsolatedWorkspaces === true;
  // Default ON: treat anything but an explicit `false` as enabled so
  // the toggle reflects the streamlined sidebar being the default experience.
  const enableStreamlinedLeftNavigation =
    experimentalQuery.data?.enableStreamlinedLeftNavigation !== false;
  const enableConferenceRoomChat = experimentalQuery.data?.enableConferenceRoomChat === true;
  const enableIssuePlanDecompositions =
    experimentalQuery.data?.enableIssuePlanDecompositions === true;
  const enableExperimentalFileViewer =
    experimentalQuery.data?.enableExperimentalFileViewer === true;
  const enableTaskWatchdogs = experimentalQuery.data?.enableTaskWatchdogs === true;
  const enableCloudSync = experimentalQuery.data?.enableCloudSync === true;
  const enableExternalObjects = experimentalQuery.data?.enableExternalObjects === true;
  const enableServerInfoDebugView = experimentalQuery.data?.enableServerInfoDebugView === true;
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
    previewMutation.mutate(parsedLookbackHours);
  }

  function enableOnly() {
    if (!lookbackHoursIsValid) return;
    toggleMutation.mutate({
      enableIssueGraphLivenessAutoRecovery: true,
      issueGraphLivenessAutoRecoveryLookbackHours: parsedLookbackHours,
    }, {
      onSuccess: () => setPreviewDialogOpen(false),
    });
  }

  function enableAndRun() {
    if (!lookbackHoursIsValid) return;
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
        className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
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

      <section className="rounded-xl border border-border bg-card p-5">
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.streamlinedNavTitle", { defaultValue: "Streamlined Left Navigation Bar" })}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("instanceExperimentalSettings.streamlinedNavDescription", { defaultValue: "Reduces the maximum number of items in the left navigation bar — nests Projects under Work with a dedicated Projects page, and shows only active agents (max 5 recently-active) in the sidebar." })}
            </p>
          </div>
          <ToggleSwitch
            checked={enableStreamlinedLeftNavigation}
            onCheckedChange={() =>
              toggleMutation.mutate({
                enableStreamlinedLeftNavigation: !enableStreamlinedLeftNavigation,
              })
            }
            disabled={toggleMutation.isPending}
            aria-label={t("instanceExperimentalSettings.streamlinedNavToggle", { defaultValue: "Toggle streamlined left navigation experimental setting" })}
          />
        </div>
      </section>

      {SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING ? (
        <section className="rounded-xl border border-border bg-card p-5">
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
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5">
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.autoRestartDevServerTitle", { defaultValue: "Auto-Restart Dev Server When Idle" })}</h2>
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold">{t("instanceExperimentalSettings.autoCreateRecoveryTasksTitle", { defaultValue: "Auto-Create Recovery Tasks" })}</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t("instanceExperimentalSettings.autoCreateRecoveryTasksDescription", { defaultValue: "Let the heartbeat scheduler create recovery tasks for task dependency chains found inside the configured lookback window." })}
              </p>
            </div>
            <ToggleSwitch
              checked={enableIssueGraphLivenessAutoRecovery}
              onCheckedChange={() => {
                if (enableIssueGraphLivenessAutoRecovery) {
                  toggleMutation.mutate({ enableIssueGraphLivenessAutoRecovery: false });
                  return;
                }
                previewForEnable();
              }}
              disabled={recoveryActionPending}
              aria-label={t("instanceExperimentalSettings.autoCreateRecoveryTasksToggle", { defaultValue: "Toggle task graph liveness auto-recovery" })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:items-end">
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
      </section>

      <RecoveryPreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        preview={pendingPreview}
        onEnableOnly={enableOnly}
        onEnableAndRun={enableAndRun}
        isPending={recoveryActionPending}
      />
    </div>
  );
}
