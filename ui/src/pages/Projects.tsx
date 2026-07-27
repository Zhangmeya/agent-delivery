import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Project } from "@penclipai/shared";
import { projectsApi } from "../api/projects";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { displaySeededName } from "../lib/seeded-display";
import { ProjectTile } from "../components/ProjectTile";
import { StatusBadge } from "../components/StatusBadge";
import { MembershipAction } from "../components/MembershipAction";
import { StarToggle } from "../components/StarToggle";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatDate, formatNumber, projectUrl } from "../lib/utils";
import {
  isStarred,
  resourceMembershipState,
  useResourceMembershipMutation,
  useResourceMemberships,
} from "../hooks/useResourceMemberships";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowRight,
  ArrowUpDown,
  CalendarDays,
  Check,
  Hexagon,
  ListChecks,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { Link } from "@/lib/router";

type ProjectSortField = "name" | "updated" | "created" | "targetDate";
type ProjectSortDir = "asc" | "desc";

const PROJECT_SORT_OPTIONS: Array<{ field: ProjectSortField; label: string }> = [
  { field: "name", label: "Name" },
  { field: "updated", label: "Updated" },
  { field: "created", label: "Created" },
  { field: "targetDate", label: "Target date" },
];

function compareProjectNames(left: Project, right: Project) {
  const nameDiff = displaySeededName(left.name).localeCompare(
    displaySeededName(right.name),
    undefined,
    { sensitivity: "base" },
  );
  return nameDiff !== 0 ? nameDiff : left.id.localeCompare(right.id);
}

function projectTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function compareOptionalTime(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
  sortDir: ProjectSortDir,
) {
  const leftTime = projectTime(left);
  const rightTime = projectTime(right);
  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return sortDir === "asc" ? leftTime - rightTime : rightTime - leftTime;
}

function sortProjects(projects: Project[], sortField: ProjectSortField, sortDir: ProjectSortDir) {
  return [...projects].sort((left, right) => {
    let comparison = 0;
    if (sortField === "name") {
      comparison = compareProjectNames(left, right);
      return sortDir === "asc" ? comparison : -comparison;
    }

    if (sortField === "updated") comparison = compareOptionalTime(left.updatedAt, right.updatedAt, sortDir);
    else if (sortField === "created") comparison = compareOptionalTime(left.createdAt, right.createdAt, sortDir);
    else comparison = compareOptionalTime(left.targetDate, right.targetDate, sortDir);

    if (comparison === 0) comparison = compareProjectNames(left, right);
    return comparison;
  });
}

export function Projects() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { openNewProject } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [sortField, setSortField] = useState<ProjectSortField>("name");
  const [sortDir, setSortDir] = useState<ProjectSortDir>("asc");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [leadFilter, setLeadFilter] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: t("Projects") }]);
  }, [setBreadcrumbs, t]);

  const { data: allProjects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const membershipsQuery = useResourceMemberships(selectedCompanyId);
  const membershipMutation = useResourceMembershipMutation(selectedCompanyId);
  const projects = useMemo(
    () => (allProjects ?? []).filter((p) => !p.archivedAt),
    [allProjects],
  );
  const agentNames = useMemo(
    () => new Map((agents ?? []).map((agent) => [agent.id, displaySeededName(agent.name)])),
    [agents],
  );
  const projectStatuses = useMemo(
    () => [...new Set(projects.map((project) => project.status))].sort(),
    [projects],
  );
  const projectLeads = useMemo(
    () => [...new Set(projects.map((project) => project.leadAgentId).filter((id): id is string => Boolean(id)))],
    [projects],
  );
  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const matching = projects.filter((project) => {
      const displayName = displaySeededName(project.name).toLocaleLowerCase();
      const matchesSearch = normalizedSearch.length === 0
        || project.name.toLocaleLowerCase().includes(normalizedSearch)
        || displayName.includes(normalizedSearch)
        || project.description?.toLocaleLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter.length === 0 || project.status === statusFilter;
      const matchesLead = leadFilter.length === 0 || project.leadAgentId === leadFilter;
      return matchesSearch && matchesStatus && matchesLead;
    });
    return sortProjects(matching, sortField, sortDir);
  }, [leadFilter, projects, search, sortDir, sortField, statusFilter]);
  const sortLabel = t(PROJECT_SORT_OPTIONS.find((option) => option.field === sortField)?.label ?? "Name");
  const hasFilters = search.trim().length > 0 || statusFilter.length > 0 || leadFilter.length > 0;

  if (!selectedCompanyId) {
    return <EmptyState icon={Hexagon} message={t("Select a company to view projects.")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t("projectList.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("projectList.subtitle")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={openNewProject}>
          <Plus className="mr-1 h-4 w-4" />
          {t("Add Project")}
        </Button>
      </header>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!isLoading && projects.length === 0 && (
        <EmptyState
          icon={Hexagon}
          message={t("No projects yet.")}
          action={t("Add Project")}
          onAction={openNewProject}
        />
      )}

      {projects.length > 0 && (
        <section className="delivery-glass-panel overflow-hidden rounded-lg">
          <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("projectList.searchPlaceholder")}
                className="h-9 w-full rounded-md border border-input bg-background/70 pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label={t("projectList.filterStatus")}
                className="h-9 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus:border-ring"
              >
                <option value="">{t("projectList.allStatuses")}</option>
                {projectStatuses.map((status) => (
                  <option key={status} value={status}>{t(`projectList.status.${status}`, { defaultValue: status })}</option>
                ))}
              </select>
              <select
                value={leadFilter}
                onChange={(event) => setLeadFilter(event.target.value)}
                aria-label={t("projectList.filterLead")}
                className="h-9 rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus:border-ring"
              >
                <option value="">{t("projectList.allLeads")}</option>
                {projectLeads.map((leadId) => (
                  <option key={leadId} value={leadId}>{agentNames.get(leadId) ?? t("projectList.unassigned")}</option>
                ))}
              </select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9" title={t("Sort")}>
                    <ArrowUpDown className="h-4 w-4" />
                    <span>{sortLabel}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 p-0">
                  <div className="space-y-0.5 p-2">
                    {PROJECT_SORT_OPTIONS.map((option) => (
                      <button
                        key={option.field}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${
                          sortField === option.field
                            ? "bg-accent/50 text-foreground"
                            : "text-muted-foreground hover:bg-accent/50"
                        }`}
                        onClick={() => {
                          if (sortField === option.field) {
                            setSortDir((current) => (current === "asc" ? "desc" : "asc"));
                            return;
                          }
                          setSortField(option.field);
                          setSortDir(option.field === "name" || option.field === "targetDate" ? "asc" : "desc");
                        }}
                      >
                        <span>{t(option.label)}</span>
                        {sortField === option.field ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Check className="h-3 w-3" />
                            {sortDir === "asc" ? t("Asc") : t("Desc")}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {hasFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setLeadFilter("");
                  }}
                >
                  <X className="h-4 w-4" />
                  {t("projectList.clearFilters")}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <span>{t("projectList.resultCount", { count: filteredProjects.length })}</span>
            <span>{t("projectList.dataNote")}</span>
          </div>

          <div className="delivery-project-grid hidden border-b border-border bg-muted/35 px-4 py-2 text-xs text-muted-foreground md:grid">
            <span>{t("projectList.columnProject")}</span>
            <span>{t("projectList.columnLead")}</span>
            <span>{t("projectList.columnTarget")}</span>
            <span>{t("projectList.columnTasks")}</span>
            <span>{t("projectList.columnStatus")}</span>
            <span className="text-right">{t("projectList.columnActions")}</span>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="py-10">
              <EmptyState
                icon={Search}
                message={t("projectList.noResults")}
                action={t("projectList.clearFilters")}
                onAction={() => {
                  setSearch("");
                  setStatusFilter("");
                  setLeadFilter("");
                }}
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredProjects.map((project) => {
                const displayName = displaySeededName(project.name);
                const state = resourceMembershipState(membershipsQuery.data, "project", project.id);
                const pending = membershipMutation.isPending
                  && membershipMutation.variables?.resourceType === "project"
                  && membershipMutation.variables.resourceId === project.id;
                const starPending = pending && membershipMutation.variables?.starred !== undefined;
                const joinLeavePending = pending && membershipMutation.variables?.starred === undefined;
                const starred = isStarred(membershipsQuery.data, "project", project.id);
                const taskCount = project.taskCount ?? 0;

                return (
                  <div
                    key={project.id}
                    className={`delivery-project-grid group items-center px-4 py-3 transition-colors hover:bg-accent/30 ${
                      state === "left" ? "text-foreground/55" : ""
                    }`}
                  >
                    <Link to={projectUrl(project)} className="flex min-w-0 items-center gap-3">
                      <ProjectTile color={project.color ?? null} icon={project.icon ?? null} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{displayName}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {project.description || t("projectList.noDescription")}
                        </span>
                      </span>
                    </Link>
                    <div className="mt-2 flex items-center gap-2 text-sm md:mt-0">
                      <UserRound className="h-4 w-4 text-muted-foreground md:hidden" />
                      <span className="truncate">
                        {project.leadAgentId
                          ? agentNames.get(project.leadAgentId) ?? t("projectList.unassigned")
                          : t("projectList.unassigned")}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground md:mt-0">
                      <CalendarDays className="h-4 w-4 md:hidden" />
                      <span className="tabular-nums">
                        {project.targetDate ? formatDate(project.targetDate) : t("projectList.noTargetDate")}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm md:mt-0">
                      <ListChecks className="h-4 w-4 text-muted-foreground md:hidden" />
                      <span className="tabular-nums">{formatNumber(taskCount)}</span>
                    </div>
                    <div className="mt-2 md:mt-0">
                      <StatusBadge status={project.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1 md:mt-0">
                      <MembershipAction
                        state={state}
                        pending={joinLeavePending}
                        pendingState={joinLeavePending ? membershipMutation.variables?.state : null}
                        resourceName={displayName}
                        onJoin={() => membershipMutation.mutate({
                          resourceType: "project",
                          resourceId: project.id,
                          resourceName: displayName,
                          state: "joined",
                        })}
                        onLeave={() => membershipMutation.mutate({
                          resourceType: "project",
                          resourceId: project.id,
                          resourceName: displayName,
                          state: "left",
                        })}
                      />
                      <StarToggle
                        size="row"
                        starred={starred}
                        pending={starPending}
                        resourceName={displayName}
                        onToggle={(next) => membershipMutation.mutate({
                          resourceType: "project",
                          resourceId: project.id,
                          resourceName: displayName,
                          starred: next,
                        })}
                      />
                      <Button asChild size="icon" variant="ghost" title={t("projectList.openProject")}>
                        <Link to={projectUrl(project)}>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
