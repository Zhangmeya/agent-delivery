import { pgTable, uuid, text, timestamp, date, index, jsonb } from "drizzle-orm/pg-core";
import type { AgentEnvConfig } from "@penclipai/shared";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { agents } from "./agents.js";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    goalId: uuid("goal_id").references(() => goals.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("backlog"),
    leadAgentId: uuid("lead_agent_id").references(() => agents.id),
    deliveryMethod: text("delivery_method"),
    projectManagerUserId: text("project_manager_user_id"),
    pmAgentId: uuid("pm_agent_id").references(() => agents.id, { onDelete: "set null" }),
    finalAcceptanceOwnerUserId: text("final_acceptance_owner_user_id"),
    plannedStartDate: date("planned_start_date"),
    skeletonStatus: text("skeleton_status").notNull().default("not_requested"),
    skeletonError: text("skeleton_error"),
    skeletonConfirmedAt: timestamp("skeleton_confirmed_at", { withTimezone: true }),
    targetDate: date("target_date"),
    color: text("color"),
    icon: text("icon"),
    env: jsonb("env").$type<AgentEnvConfig>(),
    pauseReason: text("pause_reason"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    executionWorkspacePolicy: jsonb("execution_workspace_policy").$type<Record<string, unknown>>(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("projects_company_idx").on(table.companyId),
  }),
);
