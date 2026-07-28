import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { assets } from "./assets.js";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { projects } from "./projects.js";

export const projectDeliveryStages = pgTable("project_delivery_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  status: text("status").notNull().default("locked"),
  ownerAgentId: uuid("owner_agent_id").references(() => agents.id, { onDelete: "set null" }),
  ownerUserId: text("owner_user_id"),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectOrderUq: uniqueIndex("project_delivery_stages_project_order_uq").on(table.projectId, table.sortOrder),
  projectKeyUq: uniqueIndex("project_delivery_stages_project_key_uq").on(table.projectId, table.key),
  companyProjectIdx: index("project_delivery_stages_company_project_idx").on(table.companyId, table.projectId),
}));

export const projectTaskGroups = pgTable("project_task_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => projectDeliveryStages.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  ownerAgentId: uuid("owner_agent_id").references(() => agents.id, { onDelete: "set null" }),
  ownerUserId: text("owner_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  stageOrderUq: uniqueIndex("project_task_groups_stage_order_uq").on(table.stageId, table.sortOrder),
  companyProjectIdx: index("project_task_groups_company_project_idx").on(table.companyId, table.projectId),
}));

export const issueDeliverables = pgTable("issue_deliverables", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  isRequired: boolean("is_required").notNull().default(true),
  finalReviewerUserId: text("final_reviewer_user_id").notNull(),
  officialVersionId: uuid("official_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyIssueIdx: index("issue_deliverables_company_issue_idx").on(table.companyId, table.issueId),
}));

export const issueDeliverableVersions = pgTable("issue_deliverable_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  deliverableId: uuid("deliverable_id").notNull().references(() => issueDeliverables.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  submissionType: text("submission_type").notNull(),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "restrict" }),
  url: text("url"),
  text: text("text"),
  changeSummary: text("change_summary"),
  status: text("status").notNull().default("submitted"),
  submittedByAgentId: uuid("submitted_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
  submittedByUserId: text("submitted_by_user_id"),
  reviewedByUserId: text("reviewed_by_user_id"),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  deliverableVersionUq: uniqueIndex("issue_deliverable_versions_deliverable_version_uq").on(
    table.deliverableId,
    table.versionNumber,
  ),
  companyDeliverableIdx: index("issue_deliverable_versions_company_deliverable_idx").on(
    table.companyId,
    table.deliverableId,
  ),
}));
