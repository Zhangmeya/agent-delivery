import { describe, expect, it } from "vitest";
import {
  applyProjectSkeletonSchema,
  updateProjectDeliveryStageSchema,
  updateProjectTaskGroupSchema,
} from "@penclipai/shared";
import { DELIVERY_STAGES } from "../services/project-delivery.js";

describe("digital-twin project delivery definition", () => {
  it("keeps the fixed six stages and 26 default task groups", () => {
    expect(DELIVERY_STAGES.map((stage) => stage.key)).toEqual([
      "discover",
      "scope",
      "go_no_go",
      "implement",
      "business_case",
      "maintenance",
    ]);
    expect(DELIVERY_STAGES.flatMap((stage) => stage.groups)).toHaveLength(26);
    expect(DELIVERY_STAGES[0]?.groups).toEqual(["项目范围确定", "入场准备"]);
    expect(DELIVERY_STAGES[2]?.groups).toContain("系统建模");
    expect(DELIVERY_STAGES[5]?.groups).toContain("项目复盘与经验沉淀");
  });

  it("rejects a task with both a human and Agent assignee", () => {
    const result = applyProjectSkeletonSchema.safeParse({
      groups: [{
        stageKey: "discover",
        name: "项目范围确定",
        tasks: [{
          title: "确认项目边界",
          assigneeAgentId: "2641cf03-30b6-4dfd-aefd-aa4f3bab8d48",
          assigneeUserId: "user-1",
        }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a deliverable task without a deliverable declaration", () => {
    const result = applyProjectSkeletonSchema.safeParse({
      groups: [{
        stageKey: "go_no_go",
        name: "需求与设计文档编写及评审",
        tasks: [{
          title: "提交需求文档",
          taskType: "deliverable",
        }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a task group with both a human and Agent owner", () => {
    const result = applyProjectSkeletonSchema.safeParse({
      groups: [{
        stageKey: "discover",
        name: "项目范围确定",
        ownerAgentId: "2641cf03-30b6-4dfd-aefd-aa4f3bab8d48",
        ownerUserId: "user-1",
        tasks: [{ title: "确认项目边界" }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it("requires exactly one stage and task-group owner", () => {
    expect(updateProjectDeliveryStageSchema.safeParse({ ownerUserId: "user-1" }).success).toBe(true);
    expect(updateProjectDeliveryStageSchema.safeParse({}).success).toBe(false);
    expect(updateProjectTaskGroupSchema.safeParse({
      ownerAgentId: "2641cf03-30b6-4dfd-aefd-aa4f3bab8d48",
      ownerUserId: "user-1",
    }).success).toBe(false);
  });

  it("accepts required, optional, deliverable, and gate task metadata", () => {
    const result = applyProjectSkeletonSchema.safeParse({
      groups: [{
        stageKey: "go_no_go",
        name: "Go/No-Go决策确认",
        tasks: [
          {
            title: "准备决策材料",
            taskType: "deliverable",
            isRequired: true,
            deliverables: [{
              title: "Go/No-Go决策材料",
              finalReviewerUserId: "reviewer-1",
            }],
          },
          { title: "Go/No-Go最终决策", taskType: "gate", isRequired: true, assigneeUserId: "user-1" },
          { title: "补充优化建议", taskType: "execution", isRequired: false },
        ],
      }],
    });
    expect(result.success).toBe(true);
  });
});
