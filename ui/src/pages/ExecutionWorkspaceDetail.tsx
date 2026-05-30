import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ExecutionWorkspace, Issue, Project, ProjectWorkspace, RoutineListItem } from "@penclipai/shared";
import { Copy, ExternalLink, Loader2, Play, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CopyText } from "../components/CopyText";
import { ExecutionWorkspaceCloseDialog } from "../components/ExecutionWorkspaceCloseDialog";
import { MissingPluginTabPlaceholder } from "../components/MissingPluginTabPlaceholder";
import { agentsApi } from "../api/agents";
import { executionWorkspacesApi } from "../api/execution-workspaces";
import { heartbeatsApi } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { routinesApi } from "../api/routines";
import { IssuesList } from "../components/IssuesList";
import { PageTabBar } from "../components/PageTabBar";
import { PluginSlotMount, PluginSlotOutlet, usePluginSlots } from "@/plugins/slots";
import {
  RoutineRunVariablesDialog,
  type RoutineRunDialogSubmitData,
} from "../components/RoutineRunVariablesDialog";
import {
  buildWorkspaceRuntimeControlSections,
  WorkspaceRuntimeQuickControls,
  WorkspaceRuntimeControls,
  type WorkspaceRuntimeControlRequest,
} from "../components/WorkspaceRuntimeControls";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useToastActions } from "../context/ToastContext";
import { collectLiveIssueIds } from "../lib/liveIssueIds";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatDateTime, issueUrl, projectRouteRef, projectWorkspaceUrl } from "../lib/utils";
import {
  getWorkspaceSpecificRoutineVariableNames,
  routineHasWorkspaceSpecificVariables,
} from "../lib/workspace-routines";

type WorkspaceFormState = {
  name: string;
  cwd: string;
  repoUrl: string;
  baseRef: string;
  branchName: string;
  providerRef: string;
  provisionCommand: string;
  teardownCommand: string;
  cleanupCommand: string;
  inheritRuntime: boolean;
  workspaceRuntime: string;
};

type ExecutionWorkspaceBaseTab = "services" | "configuration" | "runtime_logs" | "issues" | "routines";
type ExecutionWorkspacePluginTab = `plugin:${string}`;
type ExecutionWorkspaceTab = ExecutionWorkspaceBaseTab | ExecutionWorkspacePluginTab;
type OrderedExecutionWorkspaceTabItem = {
  value: ExecutionWorkspaceTab;
  label: string;
  order: number;
};

const DEFAULT_PLUGIN_DETAIL_TAB_ORDER = 100;
const EXECUTION_WORKSPACE_BASE_TAB_ITEMS: OrderedExecutionWorkspaceTabItem[] = [
  { value: "issues", label: "executionWorkspace.tabs.issues", order: 10 },
  { value: "services", label: "executionWorkspace.tabs.services", order: 20 },
  { value: "configuration", label: "executionWorkspace.tabs.configuration", order: 30 },
  { value: "runtime_logs", label: "executionWorkspace.tabs.runtimeLogs", order: 40 },
  { value: "routines", label: "executionWorkspace.tabs.routines", order: 60 },
];

function isExecutionWorkspacePluginTab(value: string | null): value is ExecutionWorkspacePluginTab {
  return typeof value === "string" && value.startsWith("plugin:");
}

function orderExecutionWorkspaceTabItems(items: OrderedExecutionWorkspaceTabItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => left.item.order - right.item.order || left.index - right.index)
    .map(({ item }) => item);
}

function resolveExecutionWorkspaceTab(pathname: string, workspaceId: string): ExecutionWorkspaceBaseTab | null {
  const segments = pathname.split("/").filter(Boolean);
  const executionWorkspacesIndex = segments.indexOf("execution-workspaces");
  if (executionWorkspacesIndex === -1 || segments[executionWorkspacesIndex + 1] !== workspaceId) return null;
  const tab = segments[executionWorkspacesIndex + 2];
  if (tab === "services") return "services";
  if (tab === "issues") return "issues";
  if (tab === "routines") return "routines";
  if (tab === "runtime-logs") return "runtime_logs";
  if (tab === "configuration") return "configuration";
  return null;
}

function executionWorkspaceTabPath(workspaceId: string, tab: ExecutionWorkspaceBaseTab) {
  const segment = tab === "runtime_logs" ? "runtime-logs" : tab;
  return `/execution-workspaces/${workspaceId}/${segment}`;
}

function LegacyWorkspaceTabRedirect({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    try {
      localStorage.removeItem(`paperclip:execution-workspace-tab:${workspaceId}`);
    } catch {}
  }, [workspaceId]);

  return <Navigate to={executionWorkspaceTabPath(workspaceId, "issues")} replace />;
}

function isSafeExternalUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readText(value: string | null | undefined) {
  return value ?? "";
}

function formatJson(value: Record<string, unknown> | null | undefined) {
  if (!value || Object.keys(value).length === 0) return "";
  return JSON.stringify(value, null, 2);
}

function formatOptionalDateTime(value: Date | string | null | undefined, fallback: string) {
  return value ? formatDateTime(value) : fallback;
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseWorkspaceRuntimeJson(value: string, t?: ReturnType<typeof useTranslation>["t"]) {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true as const, value: null as Record<string, unknown> | null };

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false as const,
        error: t
          ? t("executionWorkspace.workspaceCommandsJsonObjectError", { defaultValue: "Workspace commands JSON must be a JSON object." })
          : "Workspace commands JSON must be a JSON object.",
      };
    }
    return { ok: true as const, value: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error
        ? error.message
        : t
          ? t("executionWorkspace.invalidJson", { defaultValue: "Invalid JSON." })
          : "Invalid JSON.",
    };
  }
}

function formStateFromWorkspace(workspace: ExecutionWorkspace): WorkspaceFormState {
  return {
    name: workspace.name,
    cwd: readText(workspace.cwd),
    repoUrl: readText(workspace.repoUrl),
    baseRef: readText(workspace.baseRef),
    branchName: readText(workspace.branchName),
    providerRef: readText(workspace.providerRef),
    provisionCommand: readText(workspace.config?.provisionCommand),
    teardownCommand: readText(workspace.config?.teardownCommand),
    cleanupCommand: readText(workspace.config?.cleanupCommand),
    inheritRuntime: !workspace.config?.workspaceRuntime,
    workspaceRuntime: formatJson(workspace.config?.workspaceRuntime),
  };
}

function buildWorkspacePatch(initialState: WorkspaceFormState, nextState: WorkspaceFormState) {
  const patch: Record<string, unknown> = {};
  const configPatch: Record<string, unknown> = {};

  const maybeAssign = (
    key: keyof Pick<WorkspaceFormState, "name" | "cwd" | "repoUrl" | "baseRef" | "branchName" | "providerRef">,
  ) => {
    if (initialState[key] === nextState[key]) return;
    patch[key] = key === "name" ? (normalizeText(nextState[key]) ?? initialState.name) : normalizeText(nextState[key]);
  };

  maybeAssign("name");
  maybeAssign("cwd");
  maybeAssign("repoUrl");
  maybeAssign("baseRef");
  maybeAssign("branchName");
  maybeAssign("providerRef");

  const maybeAssignConfigText = (key: keyof Pick<WorkspaceFormState, "provisionCommand" | "teardownCommand" | "cleanupCommand">) => {
    if (initialState[key] === nextState[key]) return;
    configPatch[key] = normalizeText(nextState[key]);
  };

  maybeAssignConfigText("provisionCommand");
  maybeAssignConfigText("teardownCommand");
  maybeAssignConfigText("cleanupCommand");

  if (initialState.inheritRuntime !== nextState.inheritRuntime || initialState.workspaceRuntime !== nextState.workspaceRuntime) {
    const parsed = parseWorkspaceRuntimeJson(nextState.workspaceRuntime);
    if (!parsed.ok) throw new Error(parsed.error);
    configPatch.workspaceRuntime = nextState.inheritRuntime ? null : parsed.value;
  }

  if (Object.keys(configPatch).length > 0) {
    patch.config = configPatch;
  }

  return patch;
}

function validateForm(form: WorkspaceFormState, t: ReturnType<typeof useTranslation>["t"]) {
  const repoUrl = normalizeText(form.repoUrl);
  if (repoUrl) {
    try {
      new URL(repoUrl);
    } catch {
      return t("executionWorkspace.repoUrlInvalid", { defaultValue: "Repo URL must be a valid URL." });
    }
  }

  if (!form.inheritRuntime) {
    const runtimeJson = parseWorkspaceRuntimeJson(form.workspaceRuntime, t);
    if (!runtimeJson.ok) {
      return runtimeJson.error;
    }
  }

  return null;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground sm:text-right">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="shrink-0 text-xs text-muted-foreground sm:w-32">{label}</div>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

function StatusPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground", className)}>
      {children}
    </div>
  );
}

function MonoValue({ value, copy }: { value: string; copy?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex max-w-full items-start gap-2">
      <span className="break-all font-mono text-xs">{value}</span>
      {copy ? (
        <CopyText text={value} className="shrink-0 text-muted-foreground hover:text-foreground" copiedLabel={t("common.copied", { defaultValue: "Copied" })}>
          <Copy className="h-3.5 w-3.5" />
        </CopyText>
      ) : null}
    </div>
  );
}

function WorkspaceLink({
  project,
  workspace,
}: {
  project: Project;
  workspace: ProjectWorkspace;
}) {
  return <Link to={projectWorkspaceUrl(project, workspace.id)} className="hover:underline">{workspace.name}</Link>;
}

function ExecutionWorkspaceIssuesList({
  companyId,
  workspace,
  issues,
  isLoading,
  error,
  project,
}: {
  companyId: string;
  workspace: ExecutionWorkspace;
  issues: Issue[];
  isLoading: boolean;
  error: Error | null;
  project: Project | null;
}) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const liveIssueIds = useMemo(() => collectLiveIssueIds(liveRuns), [liveRuns]);

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByExecutionWorkspace(companyId, workspace.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
      if (project?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, project.id) });
      }
    },
  });

  const projectOptions = useMemo(
    () => (project ? [{ id: project.id, name: project.name, workspaces: project.workspaces ?? [] }] : undefined),
    [project],
  );
  const createIssueDefaults = useMemo(
    () => ({
      projectId: workspace.projectId,
      ...(workspace.projectWorkspaceId ? { projectWorkspaceId: workspace.projectWorkspaceId } : {}),
      executionWorkspaceId: workspace.id,
      executionWorkspaceMode: "reuse_existing",
    }),
    [workspace.id, workspace.projectId, workspace.projectWorkspaceId],
  );

  return (
    <IssuesList
      issues={issues}
      isLoading={isLoading}
      error={error}
      agents={agents}
      projects={projectOptions}
      liveIssueIds={liveIssueIds}
      projectId={project?.id}
      viewStateKey="paperclip:execution-workspace-issues-view"
      baseCreateIssueDefaults={createIssueDefaults}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
    />
  );
}

function WorkspaceRoutineRow({
  routine,
  variableNames,
  runningRoutineId,
  onRunNow,
}: {
  routine: RoutineListItem;
  variableNames: string[];
  runningRoutineId: string | null;
  onRunNow: (routine: RoutineListItem) => void;
}) {
  const { t } = useTranslation();
  const isArchived = routine.status === "archived";
  const isRunning = runningRoutineId === routine.id;

  return (
    <div className="flex flex-col gap-3 border-b border-border px-3 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/routines/${routine.id}`} className="truncate text-sm font-medium hover:underline">
            {routine.title}
          </Link>
          {routine.status !== "active" ? (
            <span className="text-xs text-muted-foreground">{t(`status.${routine.status}`, { defaultValue: routine.status })}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {routine.assigneeAgentId
              ? t("executionWorkspace.defaultAgentSet", { defaultValue: "Default agent set" })
              : t("executionWorkspace.chooseAgentWhenRunning", { defaultValue: "Choose agent when running" })}
          </span>
          <span>
            {t("executionWorkspace.lastRun", {
              time: formatOptionalDateTime(
                routine.lastRun?.triggeredAt ?? routine.lastTriggeredAt,
                t("common.never", { defaultValue: "Never" }),
              ),
              defaultValue: "Last run {{time}}",
            })}
          </span>
          <span className="flex flex-wrap gap-1">
            {variableNames.map((name) => (
              <span key={name} className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {name}
              </span>
            ))}
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full sm:w-auto"
        disabled={isArchived || isRunning}
        onClick={() => onRunNow(routine)}
      >
        {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        {isRunning
          ? t("common.runningEllipsis", { defaultValue: "Running..." })
          : t("executionWorkspace.runNow", { defaultValue: "Run now" })}
      </Button>
    </div>
  );
}

function ExecutionWorkspaceRoutinesList({
  workspace,
  project,
}: {
  workspace: ExecutionWorkspace;
  project: Project | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [runDialogRoutine, setRunDialogRoutine] = useState<RoutineListItem | null>(null);
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);

  const { data: routines, isLoading, error } = useQuery({
    queryKey: queryKeys.routines.list(workspace.companyId, { projectId: workspace.projectId }),
    queryFn: () => routinesApi.list(workspace.companyId, { projectId: workspace.projectId }),
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(workspace.companyId),
    queryFn: () => agentsApi.list(workspace.companyId),
  });

  const workspaceRoutines = useMemo(
    () => (routines ?? []).filter(routineHasWorkspaceSpecificVariables),
    [routines],
  );

  const runRoutine = useMutation({
    mutationFn: ({ id, data }: { id: string; data?: RoutineRunDialogSubmitData }) => routinesApi.run(id, {
      ...(data?.variables && Object.keys(data.variables).length > 0 ? { variables: data.variables } : {}),
      ...(data?.assigneeAgentId !== undefined ? { assigneeAgentId: data.assigneeAgentId } : {}),
      ...(data?.projectId !== undefined ? { projectId: data.projectId } : {}),
      ...(data?.executionWorkspaceId !== undefined ? { executionWorkspaceId: data.executionWorkspaceId } : {}),
      ...(data?.executionWorkspacePreference !== undefined
        ? { executionWorkspacePreference: data.executionWorkspacePreference }
        : {}),
      ...(data?.executionWorkspaceSettings !== undefined
        ? { executionWorkspaceSettings: data.executionWorkspaceSettings }
        : {}),
    }),
    onMutate: ({ id }) => {
      setRunningRoutineId(id);
    },
    onSuccess: async (_, { id }) => {
      setRunDialogRoutine(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["routines", workspace.companyId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByExecutionWorkspace(workspace.companyId, workspace.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(workspace.companyId) }),
      ]);
      pushToast({
        title: t("executionWorkspace.routineStarted", { defaultValue: "Routine started" }),
        body: t("executionWorkspace.routineStartedBody", {
          defaultValue: "Paperclip created a run using this execution workspace.",
        }),
        tone: "success",
      });
    },
    onSettled: () => {
      setRunningRoutineId(null);
    },
    onError: (mutationError) => {
      pushToast({
        title: t("executionWorkspace.routineRunFailed", { defaultValue: "Routine run failed" }),
        body: mutationError instanceof Error ? mutationError.message : t("executionWorkspace.routineRunFailedBody", {
          defaultValue: "Paperclip could not start the routine run.",
        }),
        tone: "error",
      });
    },
  });

  return (
    <>
      <Card className="rounded-none">
        <CardHeader>
          <CardTitle>{t("executionWorkspace.workspaceRoutines", { defaultValue: "Workspace routines" })}</CardTitle>
          <CardDescription>
            {t("executionWorkspace.workspaceRoutinesDescription", {
              defaultValue: "Routines that use workspace-specific variables can be run against this execution workspace.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("executionWorkspace.loadingRoutines", { defaultValue: "Loading routines..." })}</p>
          ) : error ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : t("executionWorkspace.loadRoutinesFailed", { defaultValue: "Failed to load routines." })}
            </p>
          ) : workspaceRoutines.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Repeat className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("executionWorkspace.noWorkspaceRoutines", { defaultValue: "No routines use workspace-specific variables yet." })}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border">
              {workspaceRoutines.map((routine) => (
                <WorkspaceRoutineRow
                  key={routine.id}
                  routine={routine}
                  variableNames={getWorkspaceSpecificRoutineVariableNames(routine)}
                  runningRoutineId={runningRoutineId}
                  onRunNow={setRunDialogRoutine}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RoutineRunVariablesDialog
        open={runDialogRoutine !== null}
        onOpenChange={(next) => {
          if (!next) setRunDialogRoutine(null);
        }}
        companyId={workspace.companyId}
        routineName={runDialogRoutine?.title ?? null}
        agents={agents ?? []}
        projects={project ? [project] : []}
        defaultProjectId={workspace.projectId}
        defaultAssigneeAgentId={runDialogRoutine?.assigneeAgentId ?? null}
        defaultExecutionWorkspace={workspace}
        variables={runDialogRoutine?.variables ?? []}
        isPending={runRoutine.isPending}
        onSubmit={(data) => {
          if (!runDialogRoutine) return;
          runRoutine.mutate({ id: runDialogRoutine.id, data });
        }}
      />
    </>
  );
}

export function ExecutionWorkspaceDetail() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const [form, setForm] = useState<WorkspaceFormState | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runtimeActionErrorMessage, setRuntimeActionErrorMessage] = useState<string | null>(null);
  const [runtimeActionMessage, setRuntimeActionMessage] = useState<string | null>(null);
  const activeRouteTab = workspaceId ? resolveExecutionWorkspaceTab(location.pathname, workspaceId) : null;
  const pluginTabFromSearch = useMemo(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return isExecutionWorkspacePluginTab(tab) ? tab : null;
  }, [location.search]);
  const activeTab: ExecutionWorkspaceTab | null = activeRouteTab ?? pluginTabFromSearch;

  const workspaceQuery = useQuery({
    queryKey: queryKeys.executionWorkspaces.detail(workspaceId!),
    queryFn: () => executionWorkspacesApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const workspace = workspaceQuery.data ?? null;

  const projectQuery = useQuery({
    queryKey: workspace ? [...queryKeys.projects.detail(workspace.projectId), workspace.companyId] : ["projects", "detail", "__pending__"],
    queryFn: () => projectsApi.get(workspace!.projectId, workspace!.companyId),
    enabled: Boolean(workspace?.projectId),
  });
  const project = projectQuery.data ?? null;

  const sourceIssueQuery = useQuery({
    queryKey: workspace?.sourceIssueId ? queryKeys.issues.detail(workspace.sourceIssueId) : ["issues", "detail", "__none__"],
    queryFn: () => issuesApi.get(workspace!.sourceIssueId!),
    enabled: Boolean(workspace?.sourceIssueId),
  });
  const sourceIssue = sourceIssueQuery.data ?? null;

  const derivedWorkspaceQuery = useQuery({
    queryKey: workspace?.derivedFromExecutionWorkspaceId
      ? queryKeys.executionWorkspaces.detail(workspace.derivedFromExecutionWorkspaceId)
      : ["execution-workspaces", "detail", "__none__"],
    queryFn: () => executionWorkspacesApi.get(workspace!.derivedFromExecutionWorkspaceId!),
    enabled: Boolean(workspace?.derivedFromExecutionWorkspaceId),
  });
  const derivedWorkspace = derivedWorkspaceQuery.data ?? null;
  const linkedIssuesQuery = useQuery({
    queryKey: workspace
      ? queryKeys.issues.listByExecutionWorkspace(workspace.companyId, workspace.id)
      : ["issues", "__execution-workspace__", "__none__"],
    queryFn: () => issuesApi.list(workspace!.companyId, { executionWorkspaceId: workspace!.id }),
    enabled: Boolean(workspace?.companyId),
  });
  const linkedIssues = linkedIssuesQuery.data ?? [];

  const linkedProjectWorkspace = useMemo(
    () => project?.workspaces.find((item) => item.id === workspace?.projectWorkspaceId) ?? null,
    [project, workspace?.projectWorkspaceId],
  );

  const {
    slots: workspacePluginDetailSlots,
    isLoading: workspacePluginDetailSlotsLoading,
    errorMessage: workspacePluginDetailSlotsError,
  } = usePluginSlots({
    slotTypes: ["detailTab"],
    entityType: "execution_workspace",
    companyId: workspace?.companyId ?? null,
    enabled: !!workspace?.companyId,
  });
  const workspacePluginTabItems = useMemo(
    () => workspacePluginDetailSlots.map((slot) => ({
      value: `plugin:${slot.pluginKey}:${slot.id}` as ExecutionWorkspacePluginTab,
      label: slot.displayName,
      order: slot.order ?? DEFAULT_PLUGIN_DETAIL_TAB_ORDER,
      slot,
    })),
    [workspacePluginDetailSlots],
  );
  const workspaceTabItems = useMemo(
    () => orderExecutionWorkspaceTabItems([...EXECUTION_WORKSPACE_BASE_TAB_ITEMS, ...workspacePluginTabItems]),
    [workspacePluginTabItems],
  );
  const inheritedRuntimeConfig = linkedProjectWorkspace?.runtimeConfig?.workspaceRuntime ?? null;
  const effectiveRuntimeConfig = workspace?.config?.workspaceRuntime ?? inheritedRuntimeConfig;
  const runtimeConfigSource =
    workspace?.config?.workspaceRuntime
      ? "execution_workspace"
      : inheritedRuntimeConfig
        ? "project_workspace"
        : "none";

  const initialState = useMemo(() => (workspace ? formStateFromWorkspace(workspace) : null), [workspace]);
  const isDirty = Boolean(form && initialState && JSON.stringify(form) !== JSON.stringify(initialState));
  const projectRef = project ? projectRouteRef(project) : workspace?.projectId ?? "";

  useEffect(() => {
    if (!workspace?.companyId || workspace.companyId === selectedCompanyId) return;
    setSelectedCompanyId(workspace.companyId, { source: "route_sync" });
  }, [workspace?.companyId, selectedCompanyId, setSelectedCompanyId]);

  useEffect(() => {
    if (!workspace) return;
    setForm(formStateFromWorkspace(workspace));
    setErrorMessage(null);
    setRuntimeActionErrorMessage(null);
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    const crumbs = [
      { label: t("Projects", { defaultValue: "Projects" }), href: "/projects" },
      ...(project ? [{ label: project.name, href: `/projects/${projectRef}` }] : []),
      ...(project ? [{ label: t("Workspaces", { defaultValue: "Workspaces" }), href: `/projects/${projectRef}/workspaces` }] : []),
      { label: workspace.name },
    ];
    setBreadcrumbs(crumbs);
  }, [setBreadcrumbs, workspace, project, projectRef, t]);

  const updateWorkspace = useMutation({
    mutationFn: (patch: Record<string, unknown>) => executionWorkspacesApi.update(workspace!.id, patch),
    onSuccess: (nextWorkspace) => {
      queryClient.setQueryData(queryKeys.executionWorkspaces.detail(nextWorkspace.id), nextWorkspace);
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.closeReadiness(nextWorkspace.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.workspaceOperations(nextWorkspace.id) });
      if (project) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.urlKey) });
      }
      if (sourceIssue) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(sourceIssue.id) });
      }
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : t("executionWorkspace.saveFailed", { defaultValue: "Failed to save execution workspace." }));
    },
  });
  const workspaceOperationsQuery = useQuery({
    queryKey: queryKeys.executionWorkspaces.workspaceOperations(workspaceId!),
    queryFn: () => executionWorkspacesApi.listWorkspaceOperations(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const controlRuntimeServices = useMutation({
    mutationFn: (request: WorkspaceRuntimeControlRequest) =>
      executionWorkspacesApi.controlRuntimeCommands(workspace!.id, request.action, request),
    onSuccess: (result, request) => {
      queryClient.setQueryData(queryKeys.executionWorkspaces.detail(result.workspace.id), result.workspace);
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.workspaceOperations(result.workspace.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(result.workspace.projectId) });
      setRuntimeActionErrorMessage(null);
      setRuntimeActionMessage(
        request.action === "run"
          ? t("executionWorkspace.jobCompleted", { defaultValue: "Workspace job completed." })
          : request.action === "stop"
            ? t("executionWorkspace.serviceStopped", { defaultValue: "Workspace service stopped." })
            : request.action === "restart"
              ? t("executionWorkspace.serviceRestarted", { defaultValue: "Workspace service restarted." })
              : t("executionWorkspace.serviceStarted", { defaultValue: "Workspace service started." }),
      );
    },
    onError: (error) => {
      setRuntimeActionMessage(null);
      setRuntimeActionErrorMessage(error instanceof Error ? error.message : t("executionWorkspace.controlCommandsFailed", { defaultValue: "Failed to control workspace commands." }));
    },
  });

  if (workspaceQuery.isLoading) return <p className="text-sm text-muted-foreground">{t("executionWorkspace.loadingWorkspace", { defaultValue: "Loading workspace..." })}</p>;
  if (workspaceQuery.error) {
    return (
      <p className="text-sm text-destructive">
        {workspaceQuery.error instanceof Error ? workspaceQuery.error.message : t("executionWorkspace.loadWorkspaceFailed", { defaultValue: "Failed to load workspace" })}
      </p>
    );
  }
  if (!workspace || !form || !initialState) return null;

  const canRunWorkspaceCommands = Boolean(workspace.cwd);
  const canStartRuntimeServices = Boolean(effectiveRuntimeConfig) && canRunWorkspaceCommands;
  const runtimeControlSections = buildWorkspaceRuntimeControlSections({
    runtimeConfig: effectiveRuntimeConfig,
    runtimeServices: workspace.runtimeServices ?? [],
    canStartServices: canStartRuntimeServices,
    canRunJobs: canRunWorkspaceCommands,
  });
  const pendingRuntimeAction = controlRuntimeServices.isPending ? controlRuntimeServices.variables ?? null : null;

  const pluginSlotContext = {
    companyId: workspace.companyId,
    projectId: workspace.projectId,
    entityId: workspace.id,
    entityType: "execution_workspace" as const,
  };
  const activePluginTab = workspacePluginTabItems.find((item) => item.value === activeTab) ?? null;

  if (workspaceId && activeTab === null) {
    return <LegacyWorkspaceTabRedirect workspaceId={workspaceId} />;
  }

  const handleTabChange = (tab: ExecutionWorkspaceTab) => {
    if (isExecutionWorkspacePluginTab(tab)) {
      navigate(`/execution-workspaces/${workspace.id}?tab=${encodeURIComponent(tab)}`);
      return;
    }
    navigate(executionWorkspaceTabPath(workspace.id, tab));
  };
  const baseTabLabels: Record<string, string> = {
    "executionWorkspace.tabs.issues": t("executionWorkspace.tabs.issues", { defaultValue: "Issues" }),
    "executionWorkspace.tabs.services": t("executionWorkspace.tabs.services", { defaultValue: "Services" }),
    "executionWorkspace.tabs.configuration": t("executionWorkspace.tabs.configuration", { defaultValue: "Configuration" }),
    "executionWorkspace.tabs.runtimeLogs": t("executionWorkspace.tabs.runtimeLogs", { defaultValue: "Runtime logs" }),
    "executionWorkspace.tabs.routines": t("executionWorkspace.tabs.routines", { defaultValue: "Routines" }),
  };

  const saveChanges = () => {
    const validationError = validateForm(form, t);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    let patch: Record<string, unknown>;
    try {
      patch = buildWorkspacePatch(initialState, form);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("executionWorkspace.buildUpdateFailed", { defaultValue: "Failed to build workspace update." }));
      return;
    }

    if (Object.keys(patch).length === 0) return;
    updateWorkspace.mutate(patch);
  };

  return (
    <>
      <div className="space-y-4 overflow-hidden sm:space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t("executionWorkspace.title", { defaultValue: "Execution workspace" })}
            </div>
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{workspace.name}</h1>
          </div>
          <WorkspaceRuntimeQuickControls
            sections={runtimeControlSections}
            isPending={controlRuntimeServices.isPending}
            pendingRequest={pendingRuntimeAction}
            onAction={(request) => controlRuntimeServices.mutate(request)}
          />
        </div>
        {runtimeActionErrorMessage ? <p className="text-sm text-destructive">{runtimeActionErrorMessage}</p> : null}
        {!runtimeActionErrorMessage && runtimeActionMessage ? <p className="text-sm text-muted-foreground">{runtimeActionMessage}</p> : null}

        <PluginSlotOutlet
          slotTypes={["toolbarButton", "contextMenuItem"]}
          entityType="execution_workspace"
          context={pluginSlotContext}
          className="flex flex-wrap gap-2"
          itemClassName="inline-flex"
          missingBehavior="placeholder"
        />

        <Tabs value={activeTab ?? "issues"} onValueChange={(value) => handleTabChange(value as ExecutionWorkspaceTab)}>
          <PageTabBar
            items={workspaceTabItems.map((item) => ({
              value: item.value,
              label: isExecutionWorkspacePluginTab(item.value) ? item.label : baseTabLabels[item.label] ?? item.label,
            }))}
            align="start"
            value={activeTab ?? "issues"}
            onValueChange={(value) => handleTabChange(value as ExecutionWorkspaceTab)}
          />
        </Tabs>

        {activeTab === "services" ? (
          <WorkspaceRuntimeControls
            sections={runtimeControlSections}
            isPending={controlRuntimeServices.isPending}
            pendingRequest={pendingRuntimeAction}
            serviceEmptyMessage={
              effectiveRuntimeConfig
                ? t("executionWorkspace.noServicesStarted", { defaultValue: "No services have been started for this execution workspace yet." })
                : t("executionWorkspace.noCommandConfig", { defaultValue: "No workspace command config is defined for this execution workspace yet." })
            }
            jobEmptyMessage={t("executionWorkspace.noJobsConfigured", { defaultValue: "No one-shot jobs are configured for this execution workspace yet." })}
            disabledHint={
              canStartRuntimeServices
                ? null
                : t("executionWorkspace.commandsDisabledHint", {
                    defaultValue: "Execution workspaces need a working directory before local commands can run, and services also need runtime config.",
                  })
            }
            onAction={(request) => controlRuntimeServices.mutate(request)}
          />
        ) : activeTab === "configuration" ? (
          <div className="space-y-4 sm:space-y-6">
            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>{t("executionWorkspace.workspaceSettings", { defaultValue: "Workspace settings" })}</CardTitle>
                <CardDescription>
                  {t("executionWorkspace.workspaceSettingsDescription", {
                    defaultValue: "Edit the concrete path, repo, branch, provisioning, teardown, and runtime overrides attached to this execution workspace.",
                  })}
                </CardDescription>
                <CardAction>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setCloseDialogOpen(true)}
                    disabled={workspace.status === "archived"}
                  >
                    {workspace.status === "cleanup_failed"
                      ? t("executionWorkspace.retryClose", { defaultValue: "Retry close" })
                      : t("executionWorkspace.closeWorkspace", { defaultValue: "Close workspace" })}
                  </Button>
                </CardAction>
              </CardHeader>

              <CardContent>

              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("common.general", { defaultValue: "General" })}</div>
                  <Field label={t("executionWorkspace.workspaceName", { defaultValue: "Workspace name" })}>
                    <Input
                      value={form.name}
                      onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)}
                      placeholder={t("executionWorkspace.workspaceNamePlaceholder", { defaultValue: "Execution workspace name" })}
                    />
                  </Field>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("executionWorkspace.sourceControl", { defaultValue: "Source control" })}</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("executionWorkspace.branchName", { defaultValue: "Branch name" })} hint={t("executionWorkspace.branchNameHint", { defaultValue: "Useful for isolated worktrees" })}>
                      <Input
                        className="font-mono"
                        value={form.branchName}
                        onChange={(event) => setForm((current) => current ? { ...current, branchName: event.target.value } : current)}
                        placeholder="PAP-946-workspace"
                      />
                    </Field>

                    <Field label={t("executionWorkspace.baseRef", { defaultValue: "Base ref" })}>
                      <Input
                        className="font-mono"
                        value={form.baseRef}
                        onChange={(event) => setForm((current) => current ? { ...current, baseRef: event.target.value } : current)}
                        placeholder="origin/main"
                      />
                    </Field>
                  </div>

                  <Field label={t("executionWorkspace.repoUrl", { defaultValue: "Repo URL" })}>
                    <Input
                      value={form.repoUrl}
                      onChange={(event) => setForm((current) => current ? { ...current, repoUrl: event.target.value } : current)}
                      placeholder="https://github.com/org/repo"
                    />
                  </Field>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("executionWorkspace.paths", { defaultValue: "Paths" })}</div>
                  <Field label={t("executionWorkspace.workingDirectory", { defaultValue: "Working directory" })}>
                    <Input
                      className="font-mono"
                      value={form.cwd}
                      onChange={(event) => setForm((current) => current ? { ...current, cwd: event.target.value } : current)}
                      placeholder="/absolute/path/to/workspace"
                    />
                  </Field>

                  <Field label={t("executionWorkspace.providerPathRef", { defaultValue: "Provider path / ref" })}>
                    <Input
                      className="font-mono"
                      value={form.providerRef}
                      onChange={(event) => setForm((current) => current ? { ...current, providerRef: event.target.value } : current)}
                      placeholder="/path/to/worktree or provider ref"
                    />
                  </Field>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("executionWorkspace.lifecycleCommands", { defaultValue: "Lifecycle commands" })}</div>
                  <Field label={t("executionWorkspace.provisionCommand", { defaultValue: "Provision command" })} hint={t("executionWorkspace.provisionCommandHint", { defaultValue: "Runs when Paperclip prepares this execution workspace" })}>
                    <Textarea
                      className="min-h-20 font-mono"
                      value={form.provisionCommand}
                      onChange={(event) => setForm((current) => current ? { ...current, provisionCommand: event.target.value } : current)}
                      placeholder="bash ./scripts/provision-worktree.sh"
                    />
                  </Field>

                  <Field label={t("executionWorkspace.teardownCommand", { defaultValue: "Teardown command" })} hint={t("executionWorkspace.teardownCommandHint", { defaultValue: "Runs when the execution workspace is archived or cleaned up" })}>
                    <Textarea
                      className="min-h-20 font-mono"
                      value={form.teardownCommand}
                      onChange={(event) => setForm((current) => current ? { ...current, teardownCommand: event.target.value } : current)}
                      placeholder="bash ./scripts/teardown-worktree.sh"
                    />
                  </Field>

                  <Field label={t("executionWorkspace.cleanupCommand", { defaultValue: "Cleanup command" })} hint={t("executionWorkspace.cleanupCommandHint", { defaultValue: "Workspace-specific cleanup before teardown" })}>
                    <Textarea
                      className="min-h-16 font-mono"
                      value={form.cleanupCommand}
                      onChange={(event) => setForm((current) => current ? { ...current, cleanupCommand: event.target.value } : current)}
                      placeholder="pkill -f vite || true"
                    />
                  </Field>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("executionWorkspace.runtimeConfig", { defaultValue: "Runtime config" })}</div>
                  <div className="rounded-md border border-dashed border-border/70 bg-background px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground">
                          {t("executionWorkspace.runtimeConfigSource", { defaultValue: "Runtime config source" })}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {runtimeConfigSource === "execution_workspace"
                            ? t("executionWorkspace.runtimeConfigSourceExecution", { defaultValue: "This execution workspace currently overrides the project workspace runtime config." })
                            : runtimeConfigSource === "project_workspace"
                              ? t("executionWorkspace.runtimeConfigSourceProject", { defaultValue: "This execution workspace is inheriting the project workspace runtime config." })
                              : t("executionWorkspace.runtimeConfigSourceNone", { defaultValue: "No runtime config is currently defined on this execution workspace or its project workspace." })}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        size="sm"
                        disabled={!linkedProjectWorkspace?.runtimeConfig?.workspaceRuntime}
                        onClick={() =>
                          setForm((current) => current ? {
                            ...current,
                            inheritRuntime: true,
                            workspaceRuntime: "",
                          } : current)
                        }
                      >
                        {t("executionWorkspace.resetToInherit", { defaultValue: "Reset to inherit" })}
                      </Button>
                    </div>
                  </div>

                  <details className="rounded-md border border-dashed border-border/70 bg-background px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium">{t("executionWorkspace.advancedRuntimeJson", { defaultValue: "Advanced runtime JSON" })}</summary>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("executionWorkspace.advancedRuntimeJsonDescription", {
                        defaultValue: "Override the inherited workspace command model only when this execution workspace truly needs different service or job behavior.",
                      })}
                    </p>
                    <div className="mt-3">
                      <Field
                        label={t("executionWorkspace.workspaceCommandsJson", { defaultValue: "Workspace commands JSON" })}
                        hint={t("executionWorkspace.workspaceCommandsJsonHint", { defaultValue: "Legacy `services` arrays still work, but `commands` supports both services and jobs." })}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            id="inherit-runtime-config"
                            type="checkbox"
                            className="rounded border-border"
                            checked={form.inheritRuntime}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setForm((current) => {
                                if (!current) return current;
                                if (!checked && !current.workspaceRuntime.trim() && inheritedRuntimeConfig) {
                                  return { ...current, inheritRuntime: checked, workspaceRuntime: formatJson(inheritedRuntimeConfig) };
                                }
                                return { ...current, inheritRuntime: checked };
                              });
                            }}
                          />
                          <label htmlFor="inherit-runtime-config">{t("executionWorkspace.inheritRuntimeConfig", { defaultValue: "Inherit project workspace runtime config" })}</label>
                        </div>
                        <Textarea
                          className="min-h-64 font-mono sm:min-h-96"
                          value={form.workspaceRuntime}
                          onChange={(event) => setForm((current) => current ? { ...current, workspaceRuntime: event.target.value } : current)}
                          disabled={form.inheritRuntime}
                          placeholder={'{\n  "commands": [\n    {\n      "id": "web",\n      "name": "web",\n      "kind": "service",\n      "command": "pnpm dev",\n      "cwd": ".",\n      "port": { "type": "auto" }\n    },\n    {\n      "id": "db-migrate",\n      "name": "db:migrate",\n      "kind": "job",\n      "command": "pnpm db:migrate",\n      "cwd": "."\n    }\n  ]\n}'}
                        />
                      </Field>
                    </div>
                  </details>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button className="w-full sm:w-auto" disabled={!isDirty || updateWorkspace.isPending} onClick={saveChanges}>
                  {updateWorkspace.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("common.saveChanges", { defaultValue: "Save changes" })}
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={!isDirty || updateWorkspace.isPending}
                  onClick={() => {
                    setForm(initialState);
                    setErrorMessage(null);
                    setRuntimeActionErrorMessage(null);
                    setRuntimeActionMessage(null);
                  }}
                >
                  {t("common.reset", { defaultValue: "Reset" })}
                </Button>
                {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
                {!errorMessage && !isDirty ? <p className="text-sm text-muted-foreground">{t("executionWorkspace.noUnsavedChanges", { defaultValue: "No unsaved changes." })}</p> : null}
              </div>
              </CardContent>
            </Card>

            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>{t("executionWorkspace.workspaceContext", { defaultValue: "Workspace context" })}</CardTitle>
                <CardDescription>{t("executionWorkspace.workspaceContextDescription", { defaultValue: "Linked objects and relationships" })}</CardDescription>
              </CardHeader>
              <CardContent>
              <DetailRow label={t("Project", { defaultValue: "Project" })}>
                {project ? <Link to={`/projects/${projectRef}`} className="hover:underline">{project.name}</Link> : <MonoValue value={workspace.projectId} />}
              </DetailRow>
              <DetailRow label={t("executionWorkspace.projectWorkspace", { defaultValue: "Project workspace" })}>
                {project && linkedProjectWorkspace ? (
                  <WorkspaceLink project={project} workspace={linkedProjectWorkspace} />
                ) : workspace.projectWorkspaceId ? (
                  <MonoValue value={workspace.projectWorkspaceId} />
                ) : (
                  t("common.none", { defaultValue: "None" })
                )}
              </DetailRow>
              <DetailRow label={t("executionWorkspace.sourceIssue", { defaultValue: "Source issue" })}>
                {sourceIssue ? (
                  <Link to={issueUrl(sourceIssue)} className="hover:underline">
                    {sourceIssue.identifier ?? sourceIssue.id} · {sourceIssue.title}
                  </Link>
                ) : workspace.sourceIssueId ? (
                  <MonoValue value={workspace.sourceIssueId} />
                ) : (
                  t("common.none", { defaultValue: "None" })
                )}
              </DetailRow>
              <DetailRow label={t("executionWorkspace.derivedFrom", { defaultValue: "Derived from" })}>
                {derivedWorkspace ? (
                  <Link to={executionWorkspaceTabPath(derivedWorkspace.id, "configuration")} className="hover:underline">
                    {derivedWorkspace.name}
                  </Link>
                ) : workspace.derivedFromExecutionWorkspaceId ? (
                  <MonoValue value={workspace.derivedFromExecutionWorkspaceId} />
                ) : (
                  t("common.none", { defaultValue: "None" })
                )}
              </DetailRow>
              <DetailRow label={t("executionWorkspace.workspaceId", { defaultValue: "Workspace ID" })}>
                <MonoValue value={workspace.id} />
              </DetailRow>
              </CardContent>
            </Card>

            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>{t("executionWorkspace.concreteLocation", { defaultValue: "Concrete location" })}</CardTitle>
                <CardDescription>{t("executionWorkspace.concreteLocationDescription", { defaultValue: "Paths and refs" })}</CardDescription>
              </CardHeader>
              <CardContent>
              <DetailRow label={t("executionWorkspace.workingDir", { defaultValue: "Working dir" })}>
                {workspace.cwd ? <MonoValue value={workspace.cwd} copy /> : t("common.none", { defaultValue: "None" })}
              </DetailRow>
              <DetailRow label={t("executionWorkspace.providerRef", { defaultValue: "Provider ref" })}>
                {workspace.providerRef ? <MonoValue value={workspace.providerRef} copy /> : t("common.none", { defaultValue: "None" })}
              </DetailRow>
              <DetailRow label={t("executionWorkspace.repoUrl", { defaultValue: "Repo URL" })}>
                {workspace.repoUrl && isSafeExternalUrl(workspace.repoUrl) ? (
                  <div className="inline-flex max-w-full items-start gap-2">
                    <a href={workspace.repoUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all hover:underline">
                      {workspace.repoUrl}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                    <CopyText text={workspace.repoUrl} className="shrink-0 text-muted-foreground hover:text-foreground" copiedLabel={t("common.copied", { defaultValue: "Copied" })}>
                      <Copy className="h-3.5 w-3.5" />
                    </CopyText>
                  </div>
                ) : workspace.repoUrl ? (
                  <MonoValue value={workspace.repoUrl} copy />
                ) : (
                  t("common.none", { defaultValue: "None" })
                )}
              </DetailRow>
              <DetailRow label={t("executionWorkspace.baseRef", { defaultValue: "Base ref" })}>
                {workspace.baseRef ? <MonoValue value={workspace.baseRef} copy /> : t("common.none", { defaultValue: "None" })}
              </DetailRow>
              <DetailRow label={t("executionWorkspace.branch", { defaultValue: "Branch" })}>
                {workspace.branchName ? <MonoValue value={workspace.branchName} copy /> : t("common.none", { defaultValue: "None" })}
              </DetailRow>
              <DetailRow label={t("executionWorkspace.opened", { defaultValue: "Opened" })}>{formatDateTime(workspace.openedAt)}</DetailRow>
              <DetailRow label={t("executionWorkspace.lastUsed", { defaultValue: "Last used" })}>{formatDateTime(workspace.lastUsedAt)}</DetailRow>
              <DetailRow label={t("Cleanup", { defaultValue: "Cleanup" })}>
                {workspace.cleanupEligibleAt
                  ? `${formatDateTime(workspace.cleanupEligibleAt)}${workspace.cleanupReason ? ` · ${workspace.cleanupReason}` : ""}`
                  : t("executionWorkspace.notScheduled", { defaultValue: "Not scheduled" })}
              </DetailRow>
              </CardContent>
            </Card>
          </div>
        ) : activeTab === "runtime_logs" ? (
          <Card className="rounded-none">
            <CardHeader>
              <CardTitle>{t("executionWorkspace.runtimeCleanupLogs", { defaultValue: "Runtime and cleanup logs" })}</CardTitle>
              <CardDescription>{t("executionWorkspace.recentOperations", { defaultValue: "Recent operations" })}</CardDescription>
            </CardHeader>
            <CardContent>
            {workspaceOperationsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("executionWorkspace.loadingOperations", { defaultValue: "Loading workspace operations..." })}</p>
            ) : workspaceOperationsQuery.error ? (
              <p className="text-sm text-destructive">
                {workspaceOperationsQuery.error instanceof Error
                  ? workspaceOperationsQuery.error.message
                  : t("executionWorkspace.loadOperationsFailed", { defaultValue: "Failed to load workspace operations." })}
              </p>
            ) : workspaceOperationsQuery.data && workspaceOperationsQuery.data.length > 0 ? (
              <div className="space-y-3">
                {workspaceOperationsQuery.data.map((operation) => (
                  <div key={operation.id} className="rounded-none border border-border/80 bg-background px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">{operation.command ?? operation.phase}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(operation.startedAt)}
                          {operation.finishedAt ? ` → ${formatDateTime(operation.finishedAt)}` : ""}
                        </div>
                        {operation.stderrExcerpt ? (
                          <div className="whitespace-pre-wrap break-words text-xs text-destructive">{operation.stderrExcerpt}</div>
                        ) : operation.stdoutExcerpt ? (
                          <div className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{operation.stdoutExcerpt}</div>
                        ) : null}
                      </div>
                      <StatusPill className="self-start">{operation.status}</StatusPill>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("executionWorkspace.noOperations", { defaultValue: "No workspace operations have been recorded yet." })}</p>
            )}
            </CardContent>
          </Card>
        ) : activeTab === "issues" ? (
          <ExecutionWorkspaceIssuesList
            companyId={workspace.companyId}
            workspace={workspace}
            issues={linkedIssues}
            isLoading={linkedIssuesQuery.isLoading}
            error={linkedIssuesQuery.error as Error | null}
            project={project}
          />
        ) : activePluginTab ? (
          <PluginSlotMount
            slot={activePluginTab.slot}
            context={pluginSlotContext}
            missingBehavior="placeholder"
          />
        ) : isExecutionWorkspacePluginTab(activeTab) && workspacePluginDetailSlotsLoading ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">{t("executionWorkspace.loadingPlugin", { defaultValue: "Loading workspace plugin..." })}</CardContent>
          </Card>
        ) : isExecutionWorkspacePluginTab(activeTab) && workspacePluginDetailSlotsError ? (
          <Card>
            <CardContent className="py-6 text-sm text-destructive">{workspacePluginDetailSlotsError}</CardContent>
          </Card>
        ) : isExecutionWorkspacePluginTab(activeTab) ? (
          <MissingPluginTabPlaceholder
            defaultTabHref={executionWorkspaceTabPath(workspace.id, "issues")}
            defaultTabLabel={t("executionWorkspace.backToIssues", { defaultValue: "Back to issues" })}
          />
        ) : activeTab === "routines" ? (
          <ExecutionWorkspaceRoutinesList
            workspace={workspace}
            project={project}
          />
        ) : (
          <LegacyWorkspaceTabRedirect workspaceId={workspace.id} />
        )}
      </div>
      <ExecutionWorkspaceCloseDialog
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        currentStatus={workspace.status}
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        onClosed={(nextWorkspace) => {
          queryClient.setQueryData(queryKeys.executionWorkspaces.detail(nextWorkspace.id), nextWorkspace);
          queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.closeReadiness(nextWorkspace.id) });
          queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.workspaceOperations(nextWorkspace.id) });
          if (project) {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.list(project.companyId, { projectId: project.id }) });
          }
          if (sourceIssue) {
            queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(sourceIssue.id) });
          }
        }}
      />
    </>
  );
}
