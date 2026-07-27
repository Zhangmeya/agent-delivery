import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { Agent, DashboardSummary, Issue, Project } from "@penclipai/shared";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  ShieldAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Link } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { accessApi } from "../api/access";
import { dashboardApi } from "../api/dashboard";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { SmokeLabDashboardCard } from "../components/SmokeLabDashboardCard";
import { translateRoleLabel } from "../components/agent-config-primitives";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { usePublishSharedQueryData, useSharedPollingQuery } from "../hooks/useSharedPolling";
import { buildCompanyUserProfileMap } from "../lib/company-members";
import { displaySeededName } from "../lib/seeded-display";
import { getWorkloadLevel } from "../lib/delivery-dashboard";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PluginSlotOutlet } from "@/plugins/slots";

const PROJECT_ROW_LIMIT = 6;
const ACTION_ROW_LIMIT = 6;
const RESOURCE_ROW_LIMIT = 4;

type ProjectHealth = "risk" | "attention" | "healthy";
type ActionTone = "risk" | "attention" | "info";
type WorkloadTone = "risk" | "attention" | "active" | "available";

type ProjectDeliveryRow = {
  project: Project;
  stage: string;
  health: ProjectHealth;
  blockedCount: number;
  openTaskCount: number;
  owner: string;
  targetDate: string | null;
  score: number;
};

type ActionItem = {
  key: string;
  title: string;
  detail: string;
  to: string;
  icon: LucideIcon;
  tone: ActionTone;
};

type ResourceRow = {
  key: string;
  name: string;
  subtitle: string;
  to: string | null;
  kind: "agent" | "human";
  activeCount: number;
  level: number;
  tone: WorkloadTone;
  statusLabel: string;
};

function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isOpenIssue(issue: Issue) {
  return issue.status !== "done" && issue.status !== "cancelled";
}

function projectStage(project: Project, t: ReturnType<typeof useTranslation>["t"]) {
  if (project.pauseReason) return t("dashboard.stagePaused", { defaultValue: "已暂停" });
  switch (project.status) {
    case "backlog":
      return t("dashboard.stageBacklog", { defaultValue: "待规划" });
    case "planned":
      return t("dashboard.stagePlanned", { defaultValue: "待启动" });
    case "in_progress":
      return t("dashboard.stageDelivery", { defaultValue: "执行交付" });
    case "completed":
      return t("dashboard.stageCompleted", { defaultValue: "已完成" });
    case "cancelled":
      return t("dashboard.stageCancelled", { defaultValue: "已取消" });
    default:
      return project.status;
  }
}

function healthLabel(health: ProjectHealth, t: ReturnType<typeof useTranslation>["t"]) {
  if (health === "risk") return t("dashboard.healthRisk", { defaultValue: "高风险" });
  if (health === "attention") return t("dashboard.healthAttention", { defaultValue: "需关注" });
  return t("dashboard.healthHealthy", { defaultValue: "正常" });
}

function formatTargetDate(value: string | null, language: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language, { month: "2-digit", day: "2-digit" }).format(date);
}

function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(
      "delivery-dashboard-panel min-h-0 overflow-hidden rounded-lg border border-delivery-glass-border bg-delivery-surface-strong backdrop-blur-xl",
      className,
    )}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 px-3.5">
        <Icon className="h-4 w-4 text-delivery-blue" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function HealthBadge({ health, label }: { health: ProjectHealth; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md px-2 text-xs font-medium",
        health === "risk" && "bg-destructive/10 text-destructive",
        health === "attention" && "bg-delivery-amber/15 text-foreground",
        health === "healthy" && "bg-delivery-green/12 text-delivery-green",
      )}
    >
      {label}
    </span>
  );
}

function WorkloadMeter({ level, tone }: { level: number; tone: WorkloadTone }) {
  return (
    <span className="flex w-20 shrink-0 gap-1" aria-hidden="true">
      {[1, 2, 3, 4].map((step) => (
        <span
          key={step}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            step > level && "bg-muted",
            step <= level && tone === "risk" && "bg-destructive",
            step <= level && tone === "attention" && "bg-delivery-amber",
            step <= level && tone === "active" && "bg-delivery-blue",
            step <= level && tone === "available" && "bg-delivery-green",
          )}
        />
      ))}
    </span>
  );
}

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("dashboard.title") }]);
  }, [setBreadcrumbs, t]);

  const dashboardQueryKey = queryKeys.dashboard(selectedCompanyId!);
  const sharedDashboard = useSharedPollingQuery({
    companyId: selectedCompanyId,
    resourceKey: "dashboard",
    queryKey: dashboardQueryKey,
    enabled: !!selectedCompanyId,
  });
  const {
    data,
    isLoading,
    error,
    dataUpdatedAt: dashboardUpdatedAt,
  } = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  usePublishSharedQueryData(sharedDashboard, data, dashboardUpdatedAt);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const enabledAgents = useMemo(
    () => (agents ?? []).filter((agent) => agent.status !== "terminated"),
    [agents],
  );
  const openIssues = useMemo(() => (issues ?? []).filter(isOpenIssue), [issues]);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of enabledAgents) map.set(agent.id, agent);
    return map;
  }, [enabledAgents]);

  const userProfileMap = useMemo(
    () => buildCompanyUserProfileMap(companyMembers?.users),
    [companyMembers?.users],
  );

  const blockedIssueCount = data?.tasks.blocked
    ?? openIssues.filter((issue) => issue.status === "blocked").length;

  const projectRows = useMemo<ProjectDeliveryRow[]>(() => {
    const blockedByProject = new Map<string, number>();
    const openByProject = new Map<string, number>();
    for (const issue of openIssues) {
      if (!issue.projectId) continue;
      openByProject.set(issue.projectId, (openByProject.get(issue.projectId) ?? 0) + 1);
      if (issue.status === "blocked") {
        blockedByProject.set(issue.projectId, (blockedByProject.get(issue.projectId) ?? 0) + 1);
      }
    }

    const now = Date.now();
    return (projects ?? [])
      .filter((project) => project.status !== "completed" && project.status !== "cancelled")
      .map((project) => {
        const blockedCount = blockedByProject.get(project.id) ?? 0;
        const targetTimestamp = toTimestamp(project.targetDate);
        const overdue = targetTimestamp > 0 && targetTimestamp < now;
        const health: ProjectHealth = project.pauseReason || blockedCount >= 2
          ? "risk"
          : blockedCount > 0 || overdue
            ? "attention"
            : "healthy";
        const score = (health === "risk" ? 1000 : health === "attention" ? 500 : 0)
          + blockedCount * 20
          + (overdue ? 10 : 0)
          + toTimestamp(project.updatedAt) / 1e15;

        return {
          project,
          stage: projectStage(project, t),
          health,
          blockedCount,
          openTaskCount: openByProject.get(project.id) ?? 0,
          owner: project.leadAgentId
            ? displaySeededName(agentMap.get(project.leadAgentId)?.name ?? t("dashboard.unknownOwner", { defaultValue: "未知负责人" }))
            : t("dashboard.unassignedOwner", { defaultValue: "未指定" }),
          targetDate: formatTargetDate(project.targetDate, i18n.language),
          score,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, PROJECT_ROW_LIMIT);
  }, [agentMap, i18n.language, openIssues, projects, t]);

  const highRiskProjectCount = useMemo(() => {
    const blockedByProject = new Map<string, number>();
    for (const issue of openIssues) {
      if (issue.status !== "blocked" || !issue.projectId) continue;
      blockedByProject.set(issue.projectId, (blockedByProject.get(issue.projectId) ?? 0) + 1);
    }
    return (projects ?? []).filter((project) => (
      project.status !== "completed"
      && project.status !== "cancelled"
      && (project.pauseReason !== null || (blockedByProject.get(project.id) ?? 0) >= 2)
    )).length;
  }, [openIssues, projects]);

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];

    if ((data?.pendingApprovals ?? 0) > 0) {
      items.push({
        key: "approvals",
        title: t("dashboard.pendingApprovalAction", {
          defaultValue: "{{count}} 项审批等待处理",
          count: data?.pendingApprovals ?? 0,
        }),
        detail: t("dashboard.pendingApprovalDetail", { defaultValue: "需要管理者确认后才能继续执行" }),
        to: "/approvals",
        icon: ShieldAlert,
        tone: "attention",
      });
    }

    for (const issue of openIssues
      .filter((item) => item.status === "blocked")
      .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))) {
      items.push({
        key: "blocked-" + issue.id,
        title: displaySeededName(issue.title),
        detail: t("dashboard.blockedIssueAction", {
          defaultValue: "{{identifier}} · 任务已阻塞",
          identifier: issue.identifier ?? issue.id.slice(0, 8),
        }),
        to: "/issues/" + (issue.identifier ?? issue.id),
        icon: AlertTriangle,
        tone: "risk",
      });
    }

    for (const issue of openIssues
      .filter((item) => item.status === "in_review" || item.priority === "critical" || item.priority === "high")
      .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))) {
      if (items.some((item) => item.key === "blocked-" + issue.id)) continue;
      items.push({
        key: "review-" + issue.id,
        title: displaySeededName(issue.title),
        detail: issue.status === "in_review"
          ? t("dashboard.reviewIssueAction", { defaultValue: "任务等待评审" })
          : t("dashboard.priorityIssueAction", { defaultValue: "高优先级任务需要关注" }),
        to: "/issues/" + (issue.identifier ?? issue.id),
        icon: CircleDot,
        tone: "attention",
      });
    }

    for (const agent of enabledAgents
      .filter((item) => item.status === "error" || item.status === "paused")
      .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))) {
      items.push({
        key: "agent-" + agent.id,
        title: displaySeededName(agent.name),
        detail: agent.status === "paused"
          ? t("dashboard.agentPausedAction", { defaultValue: "智能体已暂停" })
          : t("dashboard.agentErrorAction", { defaultValue: "智能体运行异常" }),
        to: "/agents/" + agent.id,
        icon: Bot,
        tone: agent.status === "error" ? "risk" : "attention",
      });
    }

    return items.slice(0, ACTION_ROW_LIMIT);
  }, [data?.pendingApprovals, enabledAgents, openIssues, t]);

  const resourceRows = useMemo<ResourceRow[]>(() => {
    const activeByAgent = new Map<string, number>();
    const activeByUser = new Map<string, number>();
    for (const issue of openIssues) {
      if (issue.assigneeAgentId) {
        activeByAgent.set(issue.assigneeAgentId, (activeByAgent.get(issue.assigneeAgentId) ?? 0) + 1);
      }
      if (issue.assigneeUserId) {
        activeByUser.set(issue.assigneeUserId, (activeByUser.get(issue.assigneeUserId) ?? 0) + 1);
      }
    }

    const rows: ResourceRow[] = enabledAgents.map((agent) => {
      const activeCount = activeByAgent.get(agent.id) ?? 0;
      const isUnavailable = agent.status === "error" || agent.status === "paused";
      const tone: WorkloadTone = isUnavailable
        ? "risk"
        : activeCount >= 4
          ? "risk"
          : activeCount >= 2
            ? "attention"
            : activeCount > 0
              ? "active"
              : "available";
      return {
        key: "agent-" + agent.id,
        name: displaySeededName(agent.name),
        subtitle: displaySeededName(agent.title)
          || translateRoleLabel(t, agent.role)
          || t("dashboard.agentResource", { defaultValue: "智能体" }),
        to: "/agents/" + agent.id,
        kind: "agent" as const,
        activeCount,
        level: getWorkloadLevel(activeCount, isUnavailable),
        tone,
        statusLabel: isUnavailable
          ? t("dashboard.workloadIntervention", { defaultValue: "需介入" })
          : activeCount >= 4
            ? t("dashboard.workloadOverload", { defaultValue: "超载" })
            : activeCount >= 2
              ? t("dashboard.workloadBusy", { defaultValue: "接近饱和" })
              : activeCount > 0
                ? t("dashboard.workloadActive", { defaultValue: "执行中" })
                : t("dashboard.workloadAvailable", { defaultValue: "可用" }),
      };
    });

    for (const [userId, profile] of userProfileMap) {
      const activeCount = activeByUser.get(userId) ?? 0;
      const tone: WorkloadTone = activeCount >= 4
        ? "risk"
        : activeCount >= 2
          ? "attention"
          : activeCount > 0
            ? "active"
            : "available";
      rows.push({
        key: "human-" + userId,
        name: profile.label,
        subtitle: t("dashboard.humanResource", { defaultValue: "团队成员" }),
        to: null,
        kind: "human",
        activeCount,
        level: getWorkloadLevel(activeCount),
        tone,
        statusLabel: activeCount >= 4
          ? t("dashboard.workloadOverload", { defaultValue: "超载" })
          : activeCount >= 2
            ? t("dashboard.workloadBusy", { defaultValue: "接近饱和" })
            : activeCount > 0
              ? t("dashboard.workloadActive", { defaultValue: "执行中" })
              : t("dashboard.workloadAvailable", { defaultValue: "可用" }),
      });
    }

    const toneScore: Record<WorkloadTone, number> = { risk: 4, attention: 3, active: 2, available: 1 };
    return rows
      .sort((left, right) => toneScore[right.tone] - toneScore[left.tone] || right.activeCount - left.activeCount)
      .slice(0, RESOURCE_ROW_LIMIT);
  }, [enabledAgents, openIssues, t, userProfileMap]);

  const inDeliveryProjectCount = (projects ?? []).filter((project) => (
    project.status !== "completed" && project.status !== "cancelled"
  )).length;
  const pendingActionCount = openIssues.filter((issue) => (
    issue.status === "blocked"
    || issue.status === "in_review"
    || issue.priority === "critical"
    || issue.priority === "high"
  )).length + enabledAgents.filter((agent) => agent.status === "error" || agent.status === "paused").length
    + (data?.pendingApprovals ?? 0);
  const availableAgentCount = enabledAgents.filter((agent) => (
    agent.status !== "error"
    && agent.status !== "paused"
    && !openIssues.some((issue) => issue.assigneeAgentId === agent.id)
  )).length;
  const primaryAction = actionItems[0] ?? null;
  const hasNoAgents = agents !== undefined && enabledAgents.length === 0;

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message={t("dashboard.welcome")}
          action={t("dashboard.getStarted")}
          onAction={openOnboarding}
        />
      );
    }
    return <EmptyState icon={LayoutDashboard} message={t("dashboard.createOrSelectCompany")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const metrics = [
    {
      label: t("dashboard.inDeliveryProjects", { defaultValue: "在交项目" }),
      value: inDeliveryProjectCount,
      icon: FolderKanban,
      tone: "text-delivery-blue",
    },
    {
      label: t("dashboard.highRiskProjects", { defaultValue: "高风险项目" }),
      value: highRiskProjectCount,
      icon: AlertTriangle,
      tone: highRiskProjectCount > 0 ? "text-destructive" : "text-muted-foreground",
    },
    {
      label: t("dashboard.pendingActions", { defaultValue: "待处理事项" }),
      value: pendingActionCount,
      icon: ShieldAlert,
      tone: pendingActionCount > 0 ? "text-delivery-amber" : "text-muted-foreground",
    },
    {
      label: t("dashboard.blockedTasks", { defaultValue: "阻塞任务" }),
      value: blockedIssueCount,
      icon: CircleDot,
      tone: blockedIssueCount > 0 ? "text-destructive" : "text-muted-foreground",
    },
    {
      label: t("dashboard.availableAgents", { defaultValue: "可用 Agent" }),
      value: availableAgentCount,
      icon: Bot,
      tone: "text-delivery-green",
    },
  ];

  return (
    <div className="space-y-2 pb-2">
      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {hasNoAgents ? (
        <div className="delivery-action-strip flex h-10 items-center gap-2 rounded-lg border border-delivery-amber/30 bg-delivery-surface-strong px-3 backdrop-blur-xl">
          <Bot className="h-4 w-4 shrink-0 text-delivery-amber" />
          <p className="min-w-0 flex-1 truncate text-sm">{t("dashboard.noAgents")}</p>
          <button
            type="button"
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId })}
            className="shrink-0 text-xs font-medium text-foreground hover:underline"
          >
            {t("dashboard.createOneHere")}
          </button>
        </div>
      ) : primaryAction ? (
        <Link
          to={primaryAction.to}
          className="delivery-action-strip flex h-10 items-center gap-2 rounded-lg border border-delivery-glass-border bg-delivery-surface-strong px-3 text-inherit no-underline backdrop-blur-xl"
        >
          <primaryAction.icon className={cn(
            "h-4 w-4 shrink-0",
            primaryAction.tone === "risk" && "text-destructive",
            primaryAction.tone === "attention" && "text-delivery-amber",
            primaryAction.tone === "info" && "text-delivery-blue",
          )} />
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">
            {t("dashboard.mustHandle", { defaultValue: "必须处理" })}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{primaryAction.title}</span>
          <span className="hidden max-w-80 truncate text-xs text-muted-foreground xl:block">{primaryAction.detail}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : (
        <div className="delivery-action-strip flex h-10 items-center gap-2 rounded-lg border border-delivery-glass-border bg-delivery-surface-strong px-3 backdrop-blur-xl">
          <CheckCircle2 className="h-4 w-4 text-delivery-green" />
          <span className="text-sm font-medium">
            {t("dashboard.noImmediateActions", { defaultValue: "当前没有需要立即处理的事项" })}
          </span>
        </div>
      )}

      <section
        className="delivery-dashboard-metrics grid h-16 grid-cols-2 overflow-hidden rounded-lg border border-delivery-glass-border bg-delivery-surface-strong backdrop-blur-xl lg:grid-cols-5"
        aria-label={t("dashboard.deliveryOverview")}
      >
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex min-w-0 items-center gap-2.5 border-r border-border/65 px-3 last:border-r-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/55">
              <Icon className={cn("h-4 w-4", tone)} />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-semibold tabular-nums leading-none">{value}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{label}</span>
            </span>
          </div>
        ))}
      </section>

      <div className="delivery-dashboard-main-grid grid min-h-64 gap-2">
        <Panel
          title={t("dashboard.projectDeliveryOverview", { defaultValue: "项目交付总览" })}
          icon={FolderKanban}
          action={(
            <Link to="/projects" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              {t("dashboard.viewAll", { defaultValue: "查看全部" })}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        >
          <div className="delivery-dashboard-project-grid h-9 items-center border-b border-border/65 px-3 text-xs font-medium text-muted-foreground">
            <span>{t("dashboard.projectColumn", { defaultValue: "项目" })}</span>
            <span>{t("dashboard.stageColumn", { defaultValue: "当前阶段" })}</span>
            <span>{t("dashboard.healthColumn", { defaultValue: "健康度" })}</span>
            <span>{t("dashboard.targetColumn", { defaultValue: "目标节点" })}</span>
            <span>{t("dashboard.blockerColumn", { defaultValue: "阻塞" })}</span>
            <span>{t("dashboard.ownerColumn", { defaultValue: "负责人" })}</span>
          </div>
          {projectRows.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              {t("dashboard.noDeliveryProjects", { defaultValue: "暂无在交项目" })}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {projectRows.map((row) => (
                <Link
                  key={row.project.id}
                  to={"/projects/" + row.project.urlKey}
                  className="delivery-dashboard-project-grid min-h-11 items-center px-3 text-inherit no-underline transition-colors hover:bg-accent/45"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{displaySeededName(row.project.name)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t("dashboard.openTaskCount", {
                        defaultValue: "{{count}} 个进行中任务",
                        count: row.openTaskCount,
                      })}
                    </span>
                  </span>
                  <span className="truncate text-xs">{row.stage}</span>
                  <HealthBadge health={row.health} label={healthLabel(row.health, t)} />
                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {row.targetDate ?? t("dashboard.noTargetDate", { defaultValue: "未设置" })}
                    </span>
                  </span>
                  <span className={cn(
                    "text-xs font-medium tabular-nums",
                    row.blockedCount > 0 ? "text-destructive" : "text-muted-foreground",
                  )}>
                    {row.blockedCount > 0
                      ? t("dashboard.blockedCountShort", {
                        defaultValue: "{{count}} 项",
                        count: row.blockedCount,
                      })
                      : t("dashboard.noneShort", { defaultValue: "无" })}
                  </span>
                  <span className="truncate text-xs">{row.owner}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={t("dashboard.pendingActions", { defaultValue: "待处理事项" })}
          icon={ShieldAlert}
          action={(
            <Link to="/inbox" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              {t("dashboard.openInbox", { defaultValue: "进入消息中心" })}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        >
          {actionItems.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-delivery-green" />
              {t("dashboard.noPendingActions", { defaultValue: "当前没有待处理事项" })}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {actionItems.map((item) => (
                <Link
                  key={item.key}
                  to={item.to}
                  className="flex min-h-11 items-center gap-2.5 px-3 text-inherit no-underline transition-colors hover:bg-accent/45"
                >
                  <span className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                    item.tone === "risk" && "bg-destructive/10 text-destructive",
                    item.tone === "attention" && "bg-delivery-amber/15 text-delivery-amber",
                    item.tone === "info" && "bg-delivery-blue/10 text-delivery-blue",
                  )}>
                    <item.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title={t("dashboard.resourceWorkload", { defaultValue: "资源负载" })}
        icon={UsersRound}
        className="h-36"
        action={(
          <Link to="/agents" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            {t("dashboard.viewResources", { defaultValue: "查看资源" })}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      >
        {resourceRows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            {t("dashboard.noResources", { defaultValue: "暂无可展示的执行资源" })}
          </div>
        ) : (
          <div className="grid h-24 grid-cols-1 divide-y divide-border/60 lg:grid-cols-2 lg:divide-x lg:divide-y-0 xl:grid-cols-4">
            {resourceRows.map((resource) => {
              const content = (
                <>
                  <span className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    resource.kind === "agent"
                      ? "bg-delivery-blue/10 text-delivery-blue"
                      : "bg-delivery-cyan/10 text-delivery-cyan",
                  )}>
                    {resource.kind === "agent"
                      ? <Bot className="h-4 w-4" />
                      : <UserRound className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{resource.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {resource.subtitle} · {t("dashboard.activeTaskCount", {
                        defaultValue: "{{count}} 项任务",
                        count: resource.activeCount,
                      })}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={cn(
                      "text-xs font-medium",
                      resource.tone === "risk" && "text-destructive",
                      resource.tone === "attention" && "text-delivery-amber",
                      resource.tone === "active" && "text-delivery-blue",
                      resource.tone === "available" && "text-delivery-green",
                    )}>
                      {resource.statusLabel}
                    </span>
                    <WorkloadMeter level={resource.level} tone={resource.tone} />
                  </span>
                </>
              );

              return resource.to ? (
                <Link
                  key={resource.key}
                  to={resource.to}
                  className="flex min-w-0 items-center gap-2.5 px-3 text-inherit no-underline transition-colors hover:bg-accent/45"
                >
                  {content}
                </Link>
              ) : (
                <div key={resource.key} className="flex min-w-0 items-center gap-2.5 px-3">
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <SmokeLabDashboardCard companyId={selectedCompanyId} />
      <PluginSlotOutlet
        slotTypes={["dashboardWidget"]}
        context={{ companyId: selectedCompanyId }}
        className="grid gap-4 md:grid-cols-2"
        itemClassName="rounded-lg border border-delivery-glass-border bg-delivery-surface p-4 shadow-sm"
      />
    </div>
  );
}
