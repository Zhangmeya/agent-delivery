import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FileJson,
  History,
  Loader2,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import type {
  CloudUpstreamActivationDecision,
  CloudUpstreamActivationEntityType,
  CloudUpstreamPreview,
  CloudUpstreamRun,
  CloudUpstreamStep,
} from "@penclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cloudUpstreamsApi } from "@/api/cloudUpstreams";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { applyCompanyPrefix, extractCompanyPrefixFromPath } from "@/lib/company-routes";
import { Link, useLocation } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";

const PENDING_CONNECTION_KEY = "paperclip-cloud-upstream-pending-connection";
const STEPS: Array<{ key: CloudUpstreamStep; label: string }> = [
  { key: "connect", label: "Connect" },
  { key: "scan", label: "Scan" },
  { key: "preview", label: "Preview" },
  { key: "push", label: "Push" },
  { key: "verify", label: "Verify" },
  { key: "activate", label: "Activate" },
];
const ACTIVATION_CATEGORIES: Array<{
  key: CloudUpstreamActivationEntityType;
  label: string;
  singular: string;
  detail: string;
}> = [
  {
    key: "agents",
    label: "Agents",
    singular: "agent",
    detail: "Confirm cloud secrets and adapter credentials before unpausing imported agents.",
  },
  {
    key: "routines",
    label: "Routines",
    singular: "routine",
    detail: "Review schedules and trigger settings before enabling imported routines.",
  },
  {
    key: "monitors",
    label: "Monitors",
    singular: "monitor",
    detail: "Activate after the target stack has been smoke tested.",
  },
];

export function CloudUpstream() {
  const { t } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [remoteUrl, setRemoteUrl] = useState("");
  const [preview, setPreview] = useState<CloudUpstreamPreview | null>(null);
  const [activeRun, setActiveRun] = useState<CloudUpstreamRun | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("Company"), href: "/dashboard" },
      { label: t("Settings"), href: "/company/settings" },
      { label: t("Cloud upstream") },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs, t]);

  const experimentalQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const cloudSyncEnabled = experimentalQuery.data?.enableCloudSync === true;

  const upstreamQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.cloudUpstreams(selectedCompanyId) : ["cloud-upstreams", "__disabled__"],
    queryFn: () => cloudUpstreamsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && cloudSyncEnabled,
  });

  const connection = upstreamQuery.data?.connections[0] ?? null;
  const latestRun = activeRun ?? upstreamQuery.data?.runs[0] ?? null;

  const callbackParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const code = callbackParams.get("code");
  const state = callbackParams.get("state");
  const callbackError = callbackParams.get("error");

  const settingsPath = useMemo(() => {
    const pathPrefix = extractCompanyPrefixFromPath(location.pathname);
    return applyCompanyPrefix("/company/settings/cloud-upstream", pathPrefix ?? selectedCompany?.issuePrefix ?? null);
  }, [location.pathname, selectedCompany?.issuePrefix]);

  const finishMutation = useMutation({
    mutationFn: (input: { pendingConnectionId: string; code: string; state: string }) =>
      cloudUpstreamsApi.finishConnect(input),
    onSuccess: async () => {
      localStorage.removeItem(PENDING_CONNECTION_KEY);
      setNotice(t("Cloud upstream connection approved."));
      setActionError(null);
      await invalidateUpstreams();
      window.history.replaceState(null, "", settingsPath);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : t("Failed to finish connection.")),
  });
  const {
    mutate: finishConnect,
    isError: finishConnectFailed,
    isPending: finishConnectPending,
    isSuccess: finishConnectSucceeded,
  } = finishMutation;

  useEffect(() => {
    if (!cloudSyncEnabled || !code || !state || finishConnectPending || finishConnectSucceeded || finishConnectFailed) return;
    const pendingConnectionId = localStorage.getItem(PENDING_CONNECTION_KEY);
    if (!pendingConnectionId) {
      setActionError(t("No pending cloud upstream connection was found. Start the connection again."));
      return;
    }
    finishConnect({ pendingConnectionId, code, state });
  }, [cloudSyncEnabled, code, finishConnect, finishConnectFailed, finishConnectPending, finishConnectSucceeded, state]);

  useEffect(() => {
    if (callbackError) {
      setActionError(t("Cloud upstream connection was not approved: {{message}}", { message: callbackError }));
    }
  }, [callbackError]);

  const startMutation = useMutation({
    mutationFn: () =>
      cloudUpstreamsApi.startConnect({
        companyId: selectedCompanyId!,
        remoteUrl,
        redirectUri: `${window.location.origin}${settingsPath}`,
      }),
    onSuccess: (result) => {
      localStorage.setItem(PENDING_CONNECTION_KEY, result.pendingConnectionId);
      setActionError(null);
      window.location.assign(result.authorizationUrl);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : t("Failed to start connection.")),
  });

  const previewMutation = useMutation({
    mutationFn: (input: { connectionId: string; companyId: string }) =>
      cloudUpstreamsApi.preview(input.connectionId, { companyId: input.companyId }),
    onSuccess: (nextPreview) => {
      setPreview(nextPreview);
      setActionError(null);
    },
    onError: (error) => setActionError(previewErrorMessage(t, error)),
  });

  const runMutation = useMutation({
    mutationFn: (input: { connectionId: string; companyId: string; retryOfRunId?: string | null }) =>
      cloudUpstreamsApi.createRun(input.connectionId, {
        companyId: input.companyId,
        retryOfRunId: input.retryOfRunId ?? null,
      }),
    onSuccess: async (run) => {
      setActiveRun(run);
      setNotice(run.status === "succeeded"
        ? t("Push run completed. Review activation before unpausing automations.")
        : t("Push run failed. Review the run events and retry after correcting the issue."));
      setActionError(null);
      await invalidateUpstreams();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : t("Failed to run push.")),
  });
  const activationMutation = useMutation({
    mutationFn: (input: { run: CloudUpstreamRun; entityType: CloudUpstreamActivationEntityType }) =>
      cloudUpstreamsApi.activateEntities(input.run.connectionId, input.run.id, {
        companyId: input.run.companyId,
        entityType: input.entityType,
      }),
    onSuccess: async (run) => {
      setActiveRun(run);
      setNotice(t("Activation checklist updated."));
      setActionError(null);
      await invalidateUpstreams();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : t("Failed to activate imported entities.")),
  });

  async function invalidateUpstreams() {
    if (!selectedCompanyId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.cloudUpstreams(selectedCompanyId) });
  }

  if (!selectedCompanyId || !selectedCompany) {
    return <div className="text-sm text-muted-foreground">{t("Select a company to configure cloud upstream.")}</div>;
  }

  if (experimentalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("Loading experimental settings...")}</div>;
  }

  if (!cloudSyncEnabled) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <CloudUpload className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("Cloud upstream")}</h1>
        </div>
        <div className="rounded-md border border-border px-4 py-4 text-sm text-muted-foreground">
          {t("Cloud sync is disabled. Enable it in")}{" "}
          <Link className="text-primary underline-offset-2 hover:underline" to="/instance/settings/experimental">
            {t("Instance Settings")}
          </Link>{" "}
          {t("to show upstream connection and push tools.")}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CloudUpload className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{t("Cloud upstream")}</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("Push {{name}} into a Paperclip Cloud stack. Automations stay paused until activation.", { name: selectedCompany.name })}
          </p>
        </div>
        {connection?.target.origin ? (
          <Button variant="outline" size="sm" asChild>
            <a href={connection.target.origin} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              {t("Open cloud")}
            </a>
          </Button>
        ) : null}
      </div>

      {notice ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <Stepper activeStep={latestRun?.activeStep ?? (preview ? "preview" : connection?.tokenStatus === "connected" ? "scan" : "connect")} />

      <section className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Connection")}</div>
        <div className="rounded-md border border-border px-4 py-4">
          {connection ? (
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <div className="text-sm font-medium">
                  {connection.target.stackDisplayName ?? connection.target.stackSlug ?? connection.target.stackId}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {connection.target.product} · {connection.target.origin} · token {connection.tokenStatus}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {t("Schema {{schema}}. Max chunk {{size}}.", { schema: connection.target.schemaMajor, size: formatBytes(connection.target.maxChunkBytes) })}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewMutation.mutate({ connectionId: connection.id, companyId: connection.companyId })}
                  disabled={previewMutation.isPending || connection.tokenStatus !== "connected"}
                >
                  {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  {t("Preview push")}
                </Button>
                {previewMutation.isPending ? <PreviewProgressHint /> : null}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                value={remoteUrl}
                onChange={(event) => setRemoteUrl(event.target.value)}
                placeholder="https://paperclip.paperclip.app/PC521D/dashboard"
                aria-label={t("Paperclip Cloud stack URL")}
              />
              <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending || !remoteUrl.trim()}>
                {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                {t("Connect")}
              </Button>
            </div>
          )}
        </div>
      </section>

      {preview ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Preview")}</div>
            <Button
              onClick={() => runMutation.mutate({ connectionId: preview.connectionId, companyId: preview.sourceCompanyId })}
              disabled={runMutation.isPending || !preview.schemaCompatible}
            >
              {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              {t("Push to cloud")}
            </Button>
          </div>
          <SummaryGrid summary={preview.summary} />
          <WarningsPanel warnings={preview.warnings} />
          <ConflictTable conflicts={preview.conflicts} />
        </section>
      ) : null}

      {latestRun ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Progress and finish")}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadRunReport(latestRun)}>
                <FileJson className="h-4 w-4" />
                {t("Download report")}
              </Button>
              {latestRun.status === "failed" || latestRun.status === "cancelled" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runMutation.mutate({
                    connectionId: latestRun.connectionId,
                    companyId: latestRun.companyId,
                    retryOfRunId: latestRun.id,
                  })}
                  disabled={runMutation.isPending}
                >
                  <RefreshCcw className="h-4 w-4" />
                  {t("Retry")}
                </Button>
              ) : latestRun.status === "succeeded" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runMutation.mutate({ connectionId: latestRun.connectionId, companyId: latestRun.companyId })}
                  disabled={runMutation.isPending}
                >
                  <RefreshCcw className="h-4 w-4" />
                  {t("Re-run")}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="rounded-md border border-border px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium capitalize">{t(latestRun.status, { defaultValue: latestRun.status })}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {latestRun.completedAt
                    ? t("Run {{id}} · completed {{date}}", { id: latestRun.id.slice(0, 8), date: formatDate(latestRun.completedAt) })
                    : t("Run {{id}} · in progress", { id: latestRun.id.slice(0, 8) })}
                </div>
              </div>
              <div className="text-sm tabular-nums">{latestRun.progressPercent}%</div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${latestRun.progressPercent}%` }} />
            </div>
            <div className="mt-4 divide-y divide-border">
              {latestRun.events.map((event) => (
                <div key={event.id} className="grid gap-2 py-2 text-sm sm:grid-cols-[7rem_8rem_1fr]">
                  <span className="text-xs text-muted-foreground">{formatDate(event.at)}</span>
                  <span className="text-xs capitalize text-muted-foreground">{t(event.phase, { defaultValue: event.phase })}</span>
                  <span>{event.message}</span>
                </div>
              ))}
            </div>
          </div>

          {latestRun.status === "succeeded" ? (
            <ActivationChecklist
              run={latestRun}
              pendingEntityType={activationMutation.variables?.entityType ?? null}
              isPending={activationMutation.isPending}
              onActivate={(entityType) => activationMutation.mutate({ run: latestRun, entityType })}
            />
          ) : null}
        </section>
      ) : null}

      {upstreamQuery.data?.runs.length ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            {t("History")}
          </div>
          <div className="divide-y divide-border rounded-md border border-border">
            {upstreamQuery.data.runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className="grid w-full gap-1 px-4 py-3 text-left text-sm hover:bg-accent/40 sm:grid-cols-[1fr_auto]"
                onClick={() => setActiveRun(run)}
              >
                <span>{t("Run {{id}} · {{status}}", { id: run.id.slice(0, 8), status: t(run.status, { defaultValue: run.status }) })}</span>
                <span className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PreviewProgressHint() {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const message = elapsed < 15
    ? t("Building manifest...")
    : elapsed < 45
      ? t("Building manifest... {{seconds}}s. Large companies can take up to a minute.", { seconds: elapsed })
      : t("Still building manifest... {{seconds}}s. PAP-scale companies routinely take ~60s.", { seconds: elapsed });
  return <div className="text-xs text-muted-foreground">{message}</div>;
}

function Stepper({ activeStep }: { activeStep: CloudUpstreamStep }) {
  const { t } = useTranslation();
  const activeIndex = STEPS.findIndex((step) => step.key === activeStep);
  return (
    <div className="grid gap-2 rounded-md border border-border px-3 py-3 sm:grid-cols-6">
      {STEPS.map((step, index) => {
        const complete = index < activeIndex;
        const active = index === activeIndex;
        return (
          <div key={step.key} className="flex items-center gap-2 text-xs">
            {complete ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <span className={active ? "h-4 w-4 rounded-full border-2 border-primary" : "h-4 w-4 rounded-full border border-border"} />
            )}
            <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>{t(step.label)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SummaryGrid({ summary }: { summary: CloudUpstreamPreview["summary"] }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {summary.map((item) => (
        <div key={item.key} className="rounded-md border border-border px-3 py-2">
          <div className="text-lg font-semibold tabular-nums">{item.count}</div>
          <div className="text-xs text-muted-foreground">{t(item.label, { defaultValue: item.label })}</div>
        </div>
      ))}
    </div>
  );
}

function WarningsPanel({ warnings }: { warnings: CloudUpstreamPreview["warnings"] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        {t("Warnings")}
      </div>
      <div className="divide-y divide-border">
        {warnings.map((warning) => (
          <div key={warning.code} className="grid gap-2 py-2 sm:grid-cols-[1.25rem_12rem_1fr]">
            <AlertTriangle className={warning.severity === "blocker" ? "h-4 w-4 text-destructive" : "h-4 w-4 text-amber-600"} />
            <div className="text-sm font-medium">{warning.title}</div>
            <div className="text-sm text-muted-foreground">{warning.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConflictTable({ conflicts }: { conflicts: CloudUpstreamPreview["conflicts"] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <div className="mb-2 text-sm font-medium">{t("Conflicts")}</div>
      {conflicts.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t("No target conflicts detected for this preview.")}</div>
      ) : (
        <div className="divide-y divide-border">
          {conflicts.map((conflict) => (
            <div key={conflict.id} className="grid gap-2 py-2 text-sm sm:grid-cols-[8rem_1fr_1fr_8rem]">
              <span className="text-muted-foreground">{conflict.entityType}</span>
              <span>{conflict.sourceLabel}</span>
              <span>{conflict.targetLabel}</span>
              <span className="capitalize">{t(conflict.plannedAction, { defaultValue: conflict.plannedAction })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivationChecklist({
  run,
  pendingEntityType,
  isPending,
  onActivate,
}: {
  run: CloudUpstreamRun;
  pendingEntityType: CloudUpstreamActivationEntityType | null;
  isPending: boolean;
  onActivate: (entityType: CloudUpstreamActivationEntityType) => void;
}) {
  const { t } = useTranslation();
  const rows = buildActivationRows(t, run);
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <div className="mb-2 text-sm font-medium">{t("Activation checklist")}</div>
      <div className="divide-y divide-border">
        {rows.map((row) => {
          const pending = isPending && pendingEntityType === row.key;
          const activated = row.status === "activated";
          return (
            <div key={row.key} className="grid gap-2 py-2 text-sm sm:grid-cols-[8rem_1fr_auto] sm:items-center">
              <div>
                <div className="font-medium">{row.label}</div>
                <div className="text-xs text-muted-foreground">{row.statusLabel}</div>
              </div>
              <div className="text-muted-foreground">
                {row.count === 0 ? t("0 imported {{label}} in this run.", { label: row.pluralLabel }) : row.detail}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  variant={activated ? "secondary" : "default"}
                  size="sm"
                  onClick={() => onActivate(row.key)}
                  disabled={row.count === 0 || activated || isPending}
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {activated ? t("Activated") : t("Activate")}
                </Button>
                <Button variant="ghost" size="sm" disabled={activated || isPending}>
                  {t("Keep paused")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const fallbackT = ((key: string, options?: Record<string, unknown>) => {
  const values = options ?? {};
  return String(values.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ""));
}) as TFunction;

export function buildActivationRows(run: CloudUpstreamRun): ReturnType<typeof buildActivationRows>;
export function buildActivationRows(t: TFunction, run: CloudUpstreamRun): Array<{
  count: number;
  pluralLabel: string;
  status: "activated" | "paused";
  label: string;
  detail: string;
  statusLabel: string;
  key: CloudUpstreamActivationEntityType;
  singular: string;
}>;
export function buildActivationRows(tOrRun: TFunction | CloudUpstreamRun, maybeRun?: CloudUpstreamRun) {
  const t = typeof tOrRun === "function" ? tOrRun : fallbackT;
  const run = typeof tOrRun === "function" ? maybeRun : tOrRun;
  if (!run) {
    throw new Error("Cloud upstream run is required to build activation rows.");
  }
  const activationChecklist = activationChecklistFromReport(run.report);
  return ACTIVATION_CATEGORIES.map((category) => {
    const decision = activationChecklist[category.key];
    const count = summaryCount(run.summary, category.key);
    const status = decision?.status === "activated" ? "activated" : "paused";
    const pluralLabel = t(category.key);
    return {
      ...category,
      count,
      pluralLabel,
      status,
      label: t(category.label),
      detail: t("{{count}} imported {{label}} are paused by default. {{detail}}", {
        count,
        label: pluralLabel,
        detail: t(category.detail),
      }),
      statusLabel: status === "activated"
        ? t("{{count}} activated", { count })
        : count === 0
          ? t("0 imported")
          : t("{{count}} paused", { count }),
    };
  });
}

function summaryCount(summary: CloudUpstreamRun["summary"], key: CloudUpstreamActivationEntityType): number {
  return summary.find((item) => item.key === key)?.count ?? 0;
}

function activationChecklistFromReport(report: CloudUpstreamRun["report"]): Partial<Record<CloudUpstreamActivationEntityType, CloudUpstreamActivationDecision>> {
  const value = optionalRecord(report.activationChecklist);
  const decisions: Partial<Record<CloudUpstreamActivationEntityType, CloudUpstreamActivationDecision>> = {};
  for (const key of ["agents", "routines", "monitors"] as const) {
    const item = optionalRecord(value[key]);
    if (!item) continue;
    decisions[key] = {
      entityType: key,
      count: typeof item.count === "number" ? item.count : 0,
      status: item.status === "activated" ? "activated" : "paused",
      activatedAt: typeof item.activatedAt === "string" ? item.activatedAt : null,
    };
  }
  return decisions;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function downloadRunReport(run: CloudUpstreamRun) {
  const blob = new Blob([JSON.stringify(run.report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cloud-upstream-run-${run.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${Math.round(value / (1024 * 1024))} MiB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KiB`;
  return `${value} B`;
}

function previewErrorMessage(t: TFunction, error: unknown): string {
  const code = error instanceof Error ? error.message : null;
  if (code === "payload_too_large" || code === "bad_request") {
    return t("Local company is too large to preview as a single request. Click Push to continue (the Push step uploads in chunks), or see the docs for chunked-preview options.");
  }
  return code ?? t("Failed to preview push.");
}
