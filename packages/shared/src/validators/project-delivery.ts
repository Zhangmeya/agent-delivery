import { z } from "zod";

export const projectDeliveryStageKeySchema = z.enum([
  "discover",
  "scope",
  "go_no_go",
  "implement",
  "business_case",
  "maintenance",
]);

export const deliveryTaskTypeSchema = z.enum(["execution", "deliverable", "gate"]);

export const applyProjectSkeletonSchema = z.object({
  groups: z.array(z.object({
    stageKey: projectDeliveryStageKeySchema,
    name: z.string().trim().min(1),
    ownerAgentId: z.string().uuid().optional().nullable(),
    ownerUserId: z.string().min(1).optional().nullable(),
    tasks: z.array(z.object({
      title: z.string().trim().min(1),
      description: z.string().optional().nullable(),
      taskType: deliveryTaskTypeSchema.optional().default("execution"),
      isRequired: z.boolean().optional().default(true),
      assigneeAgentId: z.string().uuid().optional().nullable(),
      assigneeUserId: z.string().min(1).optional().nullable(),
      deliverables: z.array(z.object({
        title: z.string().trim().min(1),
        isRequired: z.boolean().optional().default(true),
        finalReviewerUserId: z.string().min(1),
      })).optional().default([]),
    }).superRefine((value, ctx) => {
      if (value.assigneeAgentId && value.assigneeUserId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Task can only have one assignee" });
      }
      if (value.taskType === "deliverable" && value.deliverables.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliverables"],
          message: "Deliverable tasks require at least one deliverable",
        });
      }
    })).min(1).max(500),
  }).superRefine((value, ctx) => {
    if (value.ownerAgentId && value.ownerUserId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Task group can only have one owner" });
    }
  })).min(1).max(100),
});

export const updateProjectDeliveryStageSchema = z.object({
  ownerAgentId: z.string().uuid().optional().nullable(),
  ownerUserId: z.string().min(1).optional().nullable(),
}).superRefine((value, ctx) => {
  if (Boolean(value.ownerAgentId) === Boolean(value.ownerUserId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Delivery stage requires exactly one owner" });
  }
});

export const updateProjectTaskGroupSchema = z.object({
  ownerAgentId: z.string().uuid().optional().nullable(),
  ownerUserId: z.string().min(1).optional().nullable(),
}).superRefine((value, ctx) => {
  if (Boolean(value.ownerAgentId) === Boolean(value.ownerUserId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Task group requires exactly one owner" });
  }
});

export const advanceProjectDeliveryStageSchema = z.object({
  reason: z.string().trim().optional().nullable(),
});

export const reopenProjectDeliveryStageSchema = z.object({
  reason: z.string().trim().min(1),
});

export const createIssueDeliverableSchema = z.object({
  title: z.string().trim().min(1),
  isRequired: z.boolean().optional().default(true),
  finalReviewerUserId: z.string().min(1),
});

export const submitIssueDeliverableVersionSchema = z.object({
  submissionType: z.enum(["file", "link", "text"]),
  assetId: z.string().uuid().optional().nullable(),
  url: z.string().url().optional().nullable(),
  text: z.string().min(1).optional().nullable(),
  changeSummary: z.string().optional().nullable(),
}).superRefine((value, ctx) => {
  const supplied = [value.assetId, value.url, value.text].filter(Boolean).length;
  if (supplied !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Exactly one submission payload is required" });
  }
  if (value.submissionType === "file" && !value.assetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["assetId"], message: "File submission requires assetId" });
  }
  if (value.submissionType === "link" && !value.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Link submission requires url" });
  }
  if (value.submissionType === "text" && !value.text) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Text submission requires text" });
  }
});

export const reviewIssueDeliverableVersionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().optional().nullable(),
});
