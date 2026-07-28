import type {
  Project,
  ProjectDeliveryOverview,
  ProjectWorkspace,
  WorkspaceOperation,
  WorkspaceRuntimeControlTarget,
} from "@penclipai/shared";
import { api } from "./client";
import { sanitizeWorkspaceRuntimeControlTarget } from "./workspace-runtime-control";

function withCompanyScope(path: string, companyId?: string) {
  if (!companyId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
}

function projectPath(id: string, companyId?: string, suffix = "") {
  return withCompanyScope(`/projects/${encodeURIComponent(id)}${suffix}`, companyId);
}

export const projectsApi = {
  list: (companyId: string) => api.get<Project[]>(`/companies/${companyId}/projects`),
  get: (id: string, companyId?: string) => api.get<Project>(projectPath(id, companyId)),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Project>(`/companies/${companyId}/projects`, data),
  update: (id: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<Project>(projectPath(id, companyId), data),
  listWorkspaces: (projectId: string, companyId?: string) =>
    api.get<ProjectWorkspace[]>(projectPath(projectId, companyId, "/workspaces")),
  createWorkspace: (projectId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectWorkspace>(projectPath(projectId, companyId, "/workspaces"), data),
  updateWorkspace: (projectId: string, workspaceId: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<ProjectWorkspace>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`),
      data,
    ),
  controlWorkspaceRuntimeServices: (
    projectId: string,
    workspaceId: string,
    action: "start" | "stop" | "restart",
    companyId?: string,
    target: WorkspaceRuntimeControlTarget = {},
  ) =>
    api.post<{ workspace: ProjectWorkspace; operation: WorkspaceOperation }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/runtime-services/${action}`),
      sanitizeWorkspaceRuntimeControlTarget(target),
    ),
  controlWorkspaceCommands: (
    projectId: string,
    workspaceId: string,
    action: "start" | "stop" | "restart" | "run",
    companyId?: string,
    target: WorkspaceRuntimeControlTarget = {},
  ) =>
    api.post<{ workspace: ProjectWorkspace; operation: WorkspaceOperation }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/runtime-commands/${action}`),
      sanitizeWorkspaceRuntimeControlTarget(target),
    ),
  removeWorkspace: (projectId: string, workspaceId: string, companyId?: string) =>
    api.delete<ProjectWorkspace>(projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`)),
  remove: (id: string, companyId?: string) => api.delete<Project>(projectPath(id, companyId)),
  getDelivery: (id: string, companyId?: string) =>
    api.get<ProjectDeliveryOverview>(projectPath(id, companyId, "/delivery")),
  requestDeliverySkeleton: (id: string, companyId?: string) =>
    api.post(projectPath(id, companyId, "/delivery/skeleton/generate"), {}),
  confirmDeliverySkeleton: (id: string, companyId?: string) =>
    api.post<ProjectDeliveryOverview>(projectPath(id, companyId, "/delivery/skeleton/confirm"), {}),
  advanceDeliveryStage: (id: string, stageId: string, companyId?: string) =>
    api.post<ProjectDeliveryOverview>(
      projectPath(id, companyId, `/delivery/stages/${encodeURIComponent(stageId)}/advance`),
      {},
    ),
  updateDeliveryStageOwner: (
    id: string,
    stageId: string,
    owner: { ownerAgentId?: string | null; ownerUserId?: string | null },
    companyId?: string,
  ) =>
    api.patch<ProjectDeliveryOverview>(
      projectPath(id, companyId, `/delivery/stages/${encodeURIComponent(stageId)}/owner`),
      owner,
    ),
  updateDeliveryTaskGroupOwner: (
    id: string,
    groupId: string,
    owner: { ownerAgentId?: string | null; ownerUserId?: string | null },
    companyId?: string,
  ) =>
    api.patch<ProjectDeliveryOverview>(
      projectPath(id, companyId, `/delivery/task-groups/${encodeURIComponent(groupId)}/owner`),
      owner,
    ),
};
