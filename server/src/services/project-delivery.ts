import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  agents,
  companyMemberships,
  issueDeliverables,
  issues,
  projectDeliveryStages,
  projects,
  projectTaskGroups,
  type Db,
} from "@penclipai/db";
import type {
  ProjectDeliveryOverview,
  ProjectDeliveryStageKey,
  ProjectSkeletonGroupInput,
} from "@penclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { issueService } from "./issues.js";

export const DELIVERY_STAGES: ReadonlyArray<{
  key: ProjectDeliveryStageKey;
  name: string;
  groups: readonly string[];
}> = [
  { key: "discover", name: "Discover", groups: ["项目范围确定", "入场准备"] },
  { key: "scope", name: "Scope", groups: ["投标文件调研", "硬件信息调研", "业务调研", "模型调研"] },
  {
    key: "go_no_go",
    name: "Go/No-Go",
    groups: ["需求与设计文档编写及评审", "系统建模", "原型设计及评审", "高保真设计及评审", "Go/No-Go决策确认"],
  },
  {
    key: "implement",
    name: "Implement",
    groups: ["测试策划与文档", "开发需求传递", "功能开发", "部署实施", "迭代评审与优化", "系统测试", "数据对接与生产验证"],
  },
  {
    key: "business_case",
    name: "Business Case",
    groups: ["系统试运行", "用户文档与培训", "验收准备与价值呈现", "正式验收"],
  },
  {
    key: "maintenance",
    name: "Maintenance",
    groups: ["运维交接", "项目归档", "项目复盘与经验沉淀", "后续需求与N+1展望"],
  },
];

export async function initializeProjectDelivery(
  db: Db,
  project: {
    id: string;
    companyId: string;
    deliveryMethod?: string | null;
    projectManagerUserId?: string | null;
    pmAgentId?: string | null;
  },
) {
  if (project.deliveryMethod !== "digital_twin_story") return;
  if (!project.projectManagerUserId) {
    throw unprocessable("Digital-twin delivery projects require a project manager");
  }

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: projectDeliveryStages.id })
      .from(projectDeliveryStages)
      .where(eq(projectDeliveryStages.projectId, project.id))
      .limit(1);
    if (existing.length > 0) return;

    for (let stageIndex = 0; stageIndex < DELIVERY_STAGES.length; stageIndex += 1) {
      const definition = DELIVERY_STAGES[stageIndex]!;
      const stage = await tx
        .insert(projectDeliveryStages)
        .values({
          companyId: project.companyId,
          projectId: project.id,
          key: definition.key,
          name: definition.name,
          sortOrder: stageIndex,
          status: stageIndex === 0 ? "active" : "locked",
          ownerAgentId: null,
          ownerUserId: project.projectManagerUserId,
          activatedAt: stageIndex === 0 ? new Date() : null,
        })
        .returning()
        .then((rows) => rows[0]!);

      await tx.insert(projectTaskGroups).values(
        definition.groups.map((name, groupIndex) => ({
          companyId: project.companyId,
          projectId: project.id,
          stageId: stage.id,
          name,
          sortOrder: groupIndex,
          ownerAgentId: null,
          ownerUserId: project.projectManagerUserId,
        })),
      );
    }
  });
}

function percent(completed: number, total: number) {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

export function projectDeliveryService(db: Db) {
  const issueSvc = issueService(db);

  async function validateOwner(
    companyId: string,
    owner: { ownerAgentId?: string | null; ownerUserId?: string | null },
  ) {
    if (owner.ownerAgentId) {
      const agent = await db.select({ id: agents.id }).from(agents).where(and(
        eq(agents.id, owner.ownerAgentId),
        eq(agents.companyId, companyId),
      )).then((rows) => rows[0] ?? null);
      if (!agent) throw unprocessable("Delivery owner Agent must belong to the project company");
      return;
    }
    if (owner.ownerUserId) {
      const membership = await db.select({ id: companyMemberships.id }).from(companyMemberships).where(and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, owner.ownerUserId),
        eq(companyMemberships.status, "active"),
      )).then((rows) => rows[0] ?? null);
      if (!membership) throw unprocessable("Delivery owner must be an active user in the project company");
      return;
    }
    throw unprocessable("Delivery owner is required");
  }

  async function getProject(projectId: string) {
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .then((rows) => rows[0] ?? null);
    if (!project) throw notFound("Project not found");
    if (project.deliveryMethod !== "digital_twin_story" || !project.projectManagerUserId) {
      throw unprocessable("Project does not use the digital-twin delivery method");
    }
    return project;
  }

  async function overview(projectId: string): Promise<ProjectDeliveryOverview> {
    const project = await getProject(projectId);
    const [stageRows, groupRows, taskRows] = await Promise.all([
      db.select().from(projectDeliveryStages)
        .where(and(eq(projectDeliveryStages.companyId, project.companyId), eq(projectDeliveryStages.projectId, projectId)))
        .orderBy(asc(projectDeliveryStages.sortOrder)),
      db.select().from(projectTaskGroups)
        .where(and(eq(projectTaskGroups.companyId, project.companyId), eq(projectTaskGroups.projectId, projectId)))
        .orderBy(asc(projectTaskGroups.sortOrder)),
      db.select({
        id: issues.id,
        identifier: issues.identifier,
        title: issues.title,
        status: issues.status,
        deliveryStageId: issues.deliveryStageId,
        taskGroupId: issues.taskGroupId,
        deliveryTaskType: issues.deliveryTaskType,
        isRequired: issues.isRequired,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
      }).from(issues)
        .where(and(eq(issues.companyId, project.companyId), eq(issues.projectId, projectId))),
    ]);

    const tasksByGroup = new Map<string, typeof taskRows>();
    for (const task of taskRows) {
      if (!task.taskGroupId) continue;
      const bucket = tasksByGroup.get(task.taskGroupId) ?? [];
      bucket.push(task);
      tasksByGroup.set(task.taskGroupId, bucket);
    }
    const groupsByStage = new Map<string, typeof groupRows>();
    for (const group of groupRows) {
      const bucket = groupsByStage.get(group.stageId) ?? [];
      bucket.push(group);
      groupsByStage.set(group.stageId, bucket);
    }

    const stages = stageRows.map((stage) => {
      const taskGroups = (groupsByStage.get(stage.id) ?? []).map((group) => {
        const groupTasks = tasksByGroup.get(group.id) ?? [];
        const required = groupTasks.filter((task) => task.isRequired);
        const completed = required.filter((task) => task.status === "done");
        return {
          id: group.id,
          projectId: group.projectId,
          stageId: group.stageId,
          name: group.name,
          sortOrder: group.sortOrder,
          ownerAgentId: group.ownerAgentId,
          ownerUserId: group.ownerUserId,
          requiredTaskCount: required.length,
          completedRequiredTaskCount: completed.length,
          progressPercent: percent(completed.length, required.length),
          tasks: groupTasks.map((task) => ({
            id: task.id,
            identifier: task.identifier,
            title: task.title,
            status: task.status,
            taskType: task.deliveryTaskType as "execution" | "deliverable" | "gate",
            isRequired: task.isRequired,
            assigneeAgentId: task.assigneeAgentId,
            assigneeUserId: task.assigneeUserId,
          })),
        };
      });
      const requiredTaskCount = taskGroups.reduce((sum, group) => sum + group.requiredTaskCount, 0);
      const completedRequiredTaskCount = taskGroups.reduce(
        (sum, group) => sum + group.completedRequiredTaskCount,
        0,
      );
      return {
        id: stage.id,
        projectId: stage.projectId,
        key: stage.key as ProjectDeliveryStageKey,
        name: stage.name,
        sortOrder: stage.sortOrder,
        status: stage.status as "locked" | "active" | "completed",
        ownerAgentId: stage.ownerAgentId,
        ownerUserId: stage.ownerUserId,
        activatedAt: stage.activatedAt,
        completedAt: stage.completedAt,
        requiredTaskCount,
        completedRequiredTaskCount,
        progressPercent: percent(completedRequiredTaskCount, requiredTaskCount),
        taskGroups,
      };
    });
    const requiredTaskCount = stages.reduce((sum, stage) => sum + stage.requiredTaskCount, 0);
    const completedRequiredTaskCount = stages.reduce(
      (sum, stage) => sum + stage.completedRequiredTaskCount,
      0,
    );
    return {
      projectId,
      deliveryMethod: "digital_twin_story",
      projectManagerUserId: project.projectManagerUserId!,
      pmAgentId: project.pmAgentId,
      finalAcceptanceOwnerUserId: project.finalAcceptanceOwnerUserId,
      plannedStartDate: project.plannedStartDate,
      targetDate: project.targetDate,
      skeletonStatus: project.skeletonStatus as ProjectDeliveryOverview["skeletonStatus"],
      skeletonError: project.skeletonError,
      skeletonConfirmedAt: project.skeletonConfirmedAt,
      requiredTaskCount,
      completedRequiredTaskCount,
      progressPercent: percent(completedRequiredTaskCount, requiredTaskCount),
      stages,
    };
  }

  async function applySkeleton(
    projectId: string,
    groups: ProjectSkeletonGroupInput[],
    actor: { userId: string | null; agentId: string | null },
  ) {
    const project = await getProject(projectId);
    if (project.skeletonStatus === "confirmed") {
      throw conflict("Confirmed project skeleton must use change control");
    }
    const stages = await db.select().from(projectDeliveryStages).where(eq(projectDeliveryStages.projectId, projectId));
    const stageByKey = new Map(stages.map((stage) => [stage.key, stage]));
    const existingGroups = await db.select().from(projectTaskGroups).where(eq(projectTaskGroups.projectId, projectId));
    const ownerAgentIds = new Set<string>();
    const ownerUserIds = new Set<string>();
    for (const group of groups) {
      if (group.ownerAgentId) ownerAgentIds.add(group.ownerAgentId);
      if (group.ownerUserId) ownerUserIds.add(group.ownerUserId);
      for (const task of group.tasks) {
        if (task.assigneeAgentId) ownerAgentIds.add(task.assigneeAgentId);
        if (task.assigneeUserId) ownerUserIds.add(task.assigneeUserId);
        for (const deliverable of task.deliverables ?? []) {
          ownerUserIds.add(deliverable.finalReviewerUserId);
        }
      }
    }
    if (ownerAgentIds.size > 0) {
      const validAgents = await db.select({ id: agents.id }).from(agents).where(and(
        eq(agents.companyId, project.companyId),
        inArray(agents.id, Array.from(ownerAgentIds)),
      ));
      const validAgentIds = new Set(validAgents.map((agent) => agent.id));
      if (Array.from(ownerAgentIds).some((agentId) => !validAgentIds.has(agentId))) {
        throw unprocessable("Skeleton contains an Agent outside the project company");
      }
    }
    if (ownerUserIds.size > 0) {
      const validUsers = await db.select({ principalId: companyMemberships.principalId })
        .from(companyMemberships)
        .where(and(
          eq(companyMemberships.companyId, project.companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.status, "active"),
          inArray(companyMemberships.principalId, Array.from(ownerUserIds)),
        ));
      const validUserIds = new Set(validUsers.map((membership) => membership.principalId));
      if (Array.from(ownerUserIds).some((userId) => !validUserIds.has(userId))) {
        throw unprocessable("Skeleton contains a user outside the active project company membership");
      }
    }
    for (const definition of DELIVERY_STAGES) {
      for (const requiredGroupName of definition.groups) {
        if (!groups.some(
          (group) => group.stageKey === definition.key && group.name.trim() === requiredGroupName,
        )) {
          throw unprocessable(`Project skeleton is missing required task group: ${definition.name} / ${requiredGroupName}`);
        }
      }
    }

    await db.delete(issues).where(and(
      eq(issues.projectId, projectId),
      eq(issues.originKind, "manual"),
      eq(issues.originId, `delivery_skeleton:${projectId}`),
    ));

    for (const inputGroup of groups) {
      const stage = stageByKey.get(inputGroup.stageKey);
      if (!stage) throw unprocessable(`Unknown delivery stage: ${inputGroup.stageKey}`);
      let group = existingGroups.find(
        (candidate) => candidate.stageId === stage.id && candidate.name.trim() === inputGroup.name.trim(),
      );
      if (!group) {
        const nextOrder = existingGroups.filter((candidate) => candidate.stageId === stage.id).length;
        const createdGroup = await db.insert(projectTaskGroups).values({
          companyId: project.companyId,
          projectId,
          stageId: stage.id,
          name: inputGroup.name.trim(),
          sortOrder: nextOrder,
          ownerAgentId: inputGroup.ownerAgentId ?? (inputGroup.ownerUserId ? null : stage.ownerAgentId),
          ownerUserId: inputGroup.ownerUserId ?? (inputGroup.ownerAgentId ? null : stage.ownerUserId),
        }).returning().then((rows) => rows[0]!);
        existingGroups.push(createdGroup);
        group = createdGroup;
      } else {
        group = await db.update(projectTaskGroups).set({
          ownerAgentId: inputGroup.ownerAgentId ?? (inputGroup.ownerUserId ? null : stage.ownerAgentId),
          ownerUserId: inputGroup.ownerUserId ?? (inputGroup.ownerAgentId ? null : stage.ownerUserId),
          updatedAt: new Date(),
        }).where(eq(projectTaskGroups.id, group.id))
          .returning()
          .then((rows) => rows[0]!);
      }
      if (!group) throw new Error("Failed to resolve project task group");

      for (const task of inputGroup.tasks) {
        const createdTask = await issueSvc.create(project.companyId, {
          projectId,
          deliveryStageId: stage.id,
          taskGroupId: group.id,
          deliveryTaskType: task.taskType ?? "execution",
          isRequired: task.isRequired ?? true,
          title: task.title,
          description: task.description ?? null,
          status: stage.key === "discover" ? "todo" : "backlog",
          workMode: "standard",
          priority: "medium",
          assigneeAgentId: task.assigneeAgentId ?? null,
          assigneeUserId: task.assigneeUserId ?? null,
          createdByAgentId: actor.agentId,
          createdByUserId: actor.userId,
          originKind: "manual",
          originId: `delivery_skeleton:${projectId}`,
          allowDuplicate: true,
        });
        if (task.deliverables && task.deliverables.length > 0) {
          await db.insert(issueDeliverables).values(task.deliverables.map((deliverable) => ({
            companyId: project.companyId,
            projectId,
            issueId: createdTask.id,
            title: deliverable.title,
            isRequired: deliverable.isRequired ?? true,
            finalReviewerUserId: deliverable.finalReviewerUserId,
          })));
        }
      }
    }
    await db.update(projects).set({
      skeletonStatus: "draft",
      skeletonError: null,
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));
    return overview(projectId);
  }

  async function requestSkeletonGeneration(projectId: string, actorUserId: string | null) {
    const project = await getProject(projectId);
    if (!project.pmAgentId) {
      await db.update(projects).set({
        skeletonStatus: "failed",
        skeletonError: "未配置 PM Agent，无法生成项目任务骨架",
        updatedAt: new Date(),
      }).where(eq(projects.id, projectId));
      throw unprocessable("PM Agent is required to generate the project skeleton");
    }
    if (project.skeletonStatus === "confirmed") {
      throw conflict("Confirmed project skeleton must use change control");
    }
    const discoverStage = await db.select().from(projectDeliveryStages).where(and(
      eq(projectDeliveryStages.projectId, projectId),
      eq(projectDeliveryStages.key, "discover"),
    )).then((rows) => rows[0] ?? null);
    if (!discoverStage) throw notFound("Discover stage not found");
    const targetGroup = await db.select().from(projectTaskGroups).where(and(
      eq(projectTaskGroups.projectId, projectId),
      eq(projectTaskGroups.stageId, discoverStage.id),
    )).orderBy(asc(projectTaskGroups.sortOrder)).then((rows) => rows[0] ?? null);
    if (!targetGroup) throw notFound("Discover task group not found");

    const task = await issueSvc.create(project.companyId, {
      projectId,
      deliveryStageId: discoverStage.id,
      taskGroupId: targetGroup.id,
      deliveryTaskType: "execution",
      isRequired: true,
      title: "生成全项目任务骨架",
      description: [
        "请依据数字孪生故事驱动交付六步法、项目已提供材料和与项目经理的对话，生成覆盖六阶段的全项目任务骨架草案。",
        "不得虚构缺失业务事实；不明确内容必须标记“待确认”。",
        "输出需按 stageKey、任务组、任务、任务类型、必选性、负责人组织，并通过项目任务骨架接口提交草案。",
        "交付物任务必须同时声明交付物名称、必选性和唯一终审人；门禁任务必须指定人类决策人。",
      ].join("\n\n"),
      status: "todo",
      workMode: "planning",
      priority: "high",
      assigneeAgentId: project.pmAgentId,
      createdByUserId: actorUserId,
      originKind: "manual",
      originId: `delivery_skeleton_request:${projectId}`,
      allowDuplicate: false,
    });
    await db.update(projects).set({
      skeletonStatus: "pending",
      skeletonError: null,
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));
    return { issue: task, pmAgentId: project.pmAgentId };
  }

  async function failSkeletonGeneration(projectId: string, message: string) {
    await db.update(projects).set({
      skeletonStatus: "failed",
      skeletonError: message,
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));
  }

  async function confirmSkeleton(projectId: string) {
    const project = await getProject(projectId);
    if (!project.plannedStartDate || !project.targetDate) {
      throw unprocessable("Planned start date and target date are required before skeleton confirmation");
    }
    if (project.skeletonStatus !== "draft") throw unprocessable("Only a draft skeleton can be confirmed");
    const requiredTasks = await db.select({
      id: issues.id,
      type: issues.deliveryTaskType,
      assigneeAgentId: issues.assigneeAgentId,
      assigneeUserId: issues.assigneeUserId,
    }).from(issues).where(and(
      eq(issues.projectId, projectId),
      eq(issues.isRequired, true),
      eq(issues.originId, `delivery_skeleton:${projectId}`),
    ));
    if (requiredTasks.length === 0) {
      throw unprocessable("Project skeleton must contain required tasks");
    }
    if (requiredTasks.some((task) => !task.assigneeAgentId && !task.assigneeUserId)) {
      throw unprocessable("Every required task must have one assignee before skeleton confirmation");
    }
    if (requiredTasks.some((task) => task.type === "gate" && !task.assigneeUserId)) {
      throw unprocessable("Gate tasks require a human decision maker before skeleton confirmation");
    }
    const deliverableTaskIds = requiredTasks.filter((task) => task.type === "deliverable").map((task) => task.id);
    if (deliverableTaskIds.length > 0) {
      const declaredDeliverables = await db.select({ issueId: issueDeliverables.issueId })
        .from(issueDeliverables)
        .where(and(
          inArray(issueDeliverables.issueId, deliverableTaskIds),
          eq(issueDeliverables.isRequired, true),
        ));
      const declaredIssueIds = new Set(declaredDeliverables.map((deliverable) => deliverable.issueId));
      if (deliverableTaskIds.some((issueId) => !declaredIssueIds.has(issueId))) {
        throw unprocessable("Every required deliverable task must declare a required deliverable");
      }
    }
    await db.update(projects).set({
      skeletonStatus: "confirmed",
      skeletonConfirmedAt: new Date(),
      status: "in_progress",
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));
    return overview(projectId);
  }

  async function advanceStage(projectId: string, stageId: string) {
    const project = await getProject(projectId);
    if (project.skeletonStatus !== "confirmed") {
      throw unprocessable("Project skeleton must be confirmed before stage advancement");
    }
    const stage = await db.select().from(projectDeliveryStages).where(and(
      eq(projectDeliveryStages.id, stageId),
      eq(projectDeliveryStages.projectId, projectId),
    )).then((rows) => rows[0] ?? null);
    if (!stage) throw notFound("Delivery stage not found");
    if (stage.status !== "active") throw unprocessable("Only the active stage can advance");
    if (stage.key === "discover" && !project.finalAcceptanceOwnerUserId) {
      throw unprocessable("Final acceptance owner must be confirmed before entering Scope");
    }

    const stageTasks = await db.select({
      id: issues.id,
      status: issues.status,
      priority: issues.priority,
      isRequired: issues.isRequired,
    }).from(issues).where(and(
      eq(issues.projectId, projectId),
      eq(issues.deliveryStageId, stageId),
    ));
    const requiredTasks = stageTasks.filter((task) => task.isRequired);
    const incomplete = requiredTasks.filter((task) => task.status !== "done");
    if (requiredTasks.length === 0) {
      throw unprocessable("The active stage must contain required tasks before advancement");
    }
    if (incomplete.length > 0) throw unprocessable("Required tasks must be completed before stage advancement");
    const blockingHighRisk = stageTasks.some(
      (task) => task.status === "blocked" && (task.priority === "high" || task.priority === "critical"),
    );
    if (blockingHighRisk) throw unprocessable("Blocking high risk must be resolved before stage advancement");

    const unapprovedDeliverables = await db.select({ id: issueDeliverables.id })
      .from(issueDeliverables)
      .innerJoin(issues, eq(issueDeliverables.issueId, issues.id))
      .where(and(
        eq(issues.deliveryStageId, stageId),
        eq(issueDeliverables.isRequired, true),
        sql`${issueDeliverables.officialVersionId} is null`,
      ));
    if (unapprovedDeliverables.length > 0) {
      throw unprocessable("Required deliverables must be approved before stage advancement");
    }

    const nextStage = await db.select().from(projectDeliveryStages).where(and(
      eq(projectDeliveryStages.projectId, projectId),
      eq(projectDeliveryStages.sortOrder, stage.sortOrder + 1),
    )).then((rows) => rows[0] ?? null);
    await db.transaction(async (tx) => {
      await tx.update(projects).set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      await tx.update(projectDeliveryStages).set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(projectDeliveryStages.id, stageId));
      if (nextStage) {
        await tx.update(projectDeliveryStages).set({
          status: "active",
          activatedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(projectDeliveryStages.id, nextStage.id));
      } else {
        await tx.update(projects).set({ status: "completed", updatedAt: new Date() }).where(eq(projects.id, project.id));
      }
    });
    return overview(projectId);
  }

  async function reopenStage(projectId: string, stageId: string, reason: string) {
    await getProject(projectId);
    const stage = await db.select().from(projectDeliveryStages).where(and(
      eq(projectDeliveryStages.id, stageId),
      eq(projectDeliveryStages.projectId, projectId),
    )).then((rows) => rows[0] ?? null);
    if (!stage) throw notFound("Delivery stage not found");
    if (stage.status !== "completed") {
      throw unprocessable("Only a completed delivery stage can be reopened");
    }
    await db.transaction(async (tx) => {
      await tx.update(projects).set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      await tx.update(projectDeliveryStages).set({
        status: "active",
        completedAt: null,
        activatedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(projectDeliveryStages.id, stageId));
      await tx.update(projectDeliveryStages).set({ status: "locked", updatedAt: new Date() }).where(and(
        eq(projectDeliveryStages.projectId, projectId),
        sql`${projectDeliveryStages.sortOrder} > ${stage.sortOrder}`,
      ));
      await tx.update(issues).set({
        status: "blocked",
        monitorNotes: `上游阶段 ${stage.name} 已退回：${reason}`,
        updatedAt: new Date(),
      }).where(and(
        eq(issues.projectId, projectId),
        inArray(issues.deliveryStageId, (
          await tx.select({ id: projectDeliveryStages.id }).from(projectDeliveryStages).where(and(
            eq(projectDeliveryStages.projectId, projectId),
            sql`${projectDeliveryStages.sortOrder} > ${stage.sortOrder}`,
          ))
        ).map((row) => row.id)),
        sql`${issues.status} not in ('done', 'cancelled')`,
      ));
    });
    return overview(projectId);
  }

  async function updateStageOwner(
    projectId: string,
    stageId: string,
    owner: { ownerAgentId?: string | null; ownerUserId?: string | null },
  ) {
    const project = await getProject(projectId);
    await validateOwner(project.companyId, owner);
    const stage = await db.update(projectDeliveryStages).set({
      ownerAgentId: owner.ownerAgentId ?? null,
      ownerUserId: owner.ownerUserId ?? null,
      updatedAt: new Date(),
    }).where(and(
      eq(projectDeliveryStages.id, stageId),
      eq(projectDeliveryStages.projectId, projectId),
    )).returning().then((rows) => rows[0] ?? null);
    if (!stage) throw notFound("Delivery stage not found");
    return overview(projectId);
  }

  async function updateTaskGroupOwner(
    projectId: string,
    groupId: string,
    owner: { ownerAgentId?: string | null; ownerUserId?: string | null },
  ) {
    const project = await getProject(projectId);
    await validateOwner(project.companyId, owner);
    const group = await db.update(projectTaskGroups).set({
      ownerAgentId: owner.ownerAgentId ?? null,
      ownerUserId: owner.ownerUserId ?? null,
      updatedAt: new Date(),
    }).where(and(
      eq(projectTaskGroups.id, groupId),
      eq(projectTaskGroups.projectId, projectId),
    )).returning().then((rows) => rows[0] ?? null);
    if (!group) throw notFound("Project task group not found");
    return overview(projectId);
  }

  return {
    overview,
    requestSkeletonGeneration,
    failSkeletonGeneration,
    applySkeleton,
    confirmSkeleton,
    advanceStage,
    reopenStage,
    updateStageOwner,
    updateTaskGroupOwner,
  };
}
