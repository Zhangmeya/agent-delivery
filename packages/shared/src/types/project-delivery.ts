export const DIGITAL_TWIN_STORY_DELIVERY_METHOD = "digital_twin_story" as const;

export type ProjectDeliveryMethod = typeof DIGITAL_TWIN_STORY_DELIVERY_METHOD;
export type ProjectDeliveryStageKey =
  | "discover"
  | "scope"
  | "go_no_go"
  | "implement"
  | "business_case"
  | "maintenance";
export type ProjectDeliveryStageStatus = "locked" | "active" | "completed";
export type ProjectSkeletonStatus = "not_requested" | "pending" | "draft" | "confirmed" | "failed";
export type DeliveryTaskType = "execution" | "deliverable" | "gate";
export type DeliverableSubmissionType = "file" | "link" | "text";
export type DeliverableReviewStatus = "submitted" | "approved" | "rejected";

export interface ProjectDeliveryTaskSummary {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  taskType: DeliveryTaskType;
  isRequired: boolean;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
}

export interface ProjectTaskGroup {
  id: string;
  projectId: string;
  stageId: string;
  name: string;
  sortOrder: number;
  ownerAgentId: string | null;
  ownerUserId: string | null;
  requiredTaskCount: number;
  completedRequiredTaskCount: number;
  progressPercent: number;
  tasks: ProjectDeliveryTaskSummary[];
}

export interface ProjectDeliveryStage {
  id: string;
  projectId: string;
  key: ProjectDeliveryStageKey;
  name: string;
  sortOrder: number;
  status: ProjectDeliveryStageStatus;
  ownerAgentId: string | null;
  ownerUserId: string | null;
  activatedAt: Date | string | null;
  completedAt: Date | string | null;
  requiredTaskCount: number;
  completedRequiredTaskCount: number;
  progressPercent: number;
  taskGroups: ProjectTaskGroup[];
}

export interface ProjectDeliveryOverview {
  projectId: string;
  deliveryMethod: ProjectDeliveryMethod;
  projectManagerUserId: string;
  pmAgentId: string | null;
  finalAcceptanceOwnerUserId: string | null;
  plannedStartDate: string | null;
  targetDate: string | null;
  skeletonStatus: ProjectSkeletonStatus;
  skeletonError: string | null;
  skeletonConfirmedAt: Date | string | null;
  requiredTaskCount: number;
  completedRequiredTaskCount: number;
  progressPercent: number;
  stages: ProjectDeliveryStage[];
}

export interface ProjectSkeletonTaskInput {
  title: string;
  description?: string | null;
  taskType?: DeliveryTaskType;
  isRequired?: boolean;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  deliverables?: Array<{
    title: string;
    isRequired?: boolean;
    finalReviewerUserId: string;
  }>;
}

export interface ProjectSkeletonGroupInput {
  stageKey: ProjectDeliveryStageKey;
  name: string;
  ownerAgentId?: string | null;
  ownerUserId?: string | null;
  tasks: ProjectSkeletonTaskInput[];
}
