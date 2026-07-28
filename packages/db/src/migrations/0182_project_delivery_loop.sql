-- Agent Delivery phase two: minimum project delivery loop.
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "delivery_method" text,
  ADD COLUMN IF NOT EXISTS "project_manager_user_id" text,
  ADD COLUMN IF NOT EXISTS "pm_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "final_acceptance_owner_user_id" text,
  ADD COLUMN IF NOT EXISTS "planned_start_date" date,
  ADD COLUMN IF NOT EXISTS "skeleton_status" text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS "skeleton_error" text,
  ADD COLUMN IF NOT EXISTS "skeleton_confirmed_at" timestamptz;

CREATE TABLE IF NOT EXISTS "project_delivery_stages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'locked',
  "owner_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "owner_user_id" text,
  "activated_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_delivery_stages_project_order_uq" ON "project_delivery_stages" ("project_id", "sort_order");
CREATE UNIQUE INDEX IF NOT EXISTS "project_delivery_stages_project_key_uq" ON "project_delivery_stages" ("project_id", "key");
CREATE INDEX IF NOT EXISTS "project_delivery_stages_company_project_idx" ON "project_delivery_stages" ("company_id", "project_id");

CREATE TABLE IF NOT EXISTS "project_task_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "stage_id" uuid NOT NULL REFERENCES "project_delivery_stages"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL,
  "owner_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "owner_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_task_groups_stage_order_uq" ON "project_task_groups" ("stage_id", "sort_order");
CREATE INDEX IF NOT EXISTS "project_task_groups_company_project_idx" ON "project_task_groups" ("company_id", "project_id");

ALTER TABLE "issues"
  ADD COLUMN IF NOT EXISTS "delivery_stage_id" uuid REFERENCES "project_delivery_stages"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "task_group_id" uuid REFERENCES "project_task_groups"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "delivery_task_type" text NOT NULL DEFAULT 'execution',
  ADD COLUMN IF NOT EXISTS "is_required" boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "issues_company_delivery_stage_idx" ON "issues" ("company_id", "delivery_stage_id");
CREATE INDEX IF NOT EXISTS "issues_company_task_group_idx" ON "issues" ("company_id", "task_group_id");

CREATE TABLE IF NOT EXISTS "issue_deliverables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "issue_id" uuid NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "is_required" boolean NOT NULL DEFAULT true,
  "final_reviewer_user_id" text NOT NULL,
  "official_version_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "issue_deliverables_company_issue_idx" ON "issue_deliverables" ("company_id", "issue_id");

CREATE TABLE IF NOT EXISTS "issue_deliverable_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "deliverable_id" uuid NOT NULL REFERENCES "issue_deliverables"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "submission_type" text NOT NULL,
  "asset_id" uuid REFERENCES "assets"("id") ON DELETE RESTRICT,
  "url" text,
  "text" text,
  "change_summary" text,
  "status" text NOT NULL DEFAULT 'submitted',
  "submitted_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "submitted_by_user_id" text,
  "reviewed_by_user_id" text,
  "review_note" text,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "issue_deliverable_versions_payload_ck" CHECK (
    ("submission_type" = 'file' AND "asset_id" IS NOT NULL AND "url" IS NULL AND "text" IS NULL) OR
    ("submission_type" = 'link' AND "asset_id" IS NULL AND "url" IS NOT NULL AND "text" IS NULL) OR
    ("submission_type" = 'text' AND "asset_id" IS NULL AND "url" IS NULL AND "text" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "issue_deliverable_versions_deliverable_version_uq" ON "issue_deliverable_versions" ("deliverable_id", "version_number");
CREATE INDEX IF NOT EXISTS "issue_deliverable_versions_company_deliverable_idx" ON "issue_deliverable_versions" ("company_id", "deliverable_id");
ALTER TABLE "issue_deliverables"
  ADD CONSTRAINT "issue_deliverables_official_version_fk"
  FOREIGN KEY ("official_version_id") REFERENCES "issue_deliverable_versions"("id") ON DELETE SET NULL;
