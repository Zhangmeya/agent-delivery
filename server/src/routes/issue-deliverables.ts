import { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  assets,
  companyMemberships,
  issueDeliverables,
  issueDeliverableVersions,
  issues,
  type Db,
} from "@penclipai/db";
import {
  createIssueDeliverableSchema,
  reviewIssueDeliverableVersionSchema,
  submitIssueDeliverableVersionSchema,
} from "@penclipai/shared";
import { validate } from "../middleware/validate.js";
import { forbidden, notFound, unprocessable } from "../errors.js";
import { logActivity } from "../services/activity-log.js";
import { assertCompanyAccess, getActorInfo, hasCompanyAccess } from "./authz.js";

export function issueDeliverableRoutes(db: Db) {
  const router = Router();

  async function loadIssue(issueId: string) {
    const issue = await db.select().from(issues).where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);
    if (!issue) throw notFound("Issue not found");
    if (!issue.projectId) throw unprocessable("Deliverable tasks must belong to a project");
    return issue;
  }

  router.get("/issues/:issueId/deliverables", async (req, res) => {
    const issue = await loadIssue(req.params.issueId as string);
    if (!hasCompanyAccess(req, issue.companyId)) throw notFound("Issue not found");
    assertCompanyAccess(req, issue.companyId);
    const deliverables = await db.select().from(issueDeliverables)
      .where(and(eq(issueDeliverables.companyId, issue.companyId), eq(issueDeliverables.issueId, issue.id)))
      .orderBy(asc(issueDeliverables.createdAt));
    const result = await Promise.all(deliverables.map(async (deliverable) => ({
      ...deliverable,
      versions: await db.select().from(issueDeliverableVersions)
        .where(eq(issueDeliverableVersions.deliverableId, deliverable.id))
        .orderBy(asc(issueDeliverableVersions.versionNumber)),
    })));
    res.json(result);
  });

  router.post(
    "/issues/:issueId/deliverables",
    validate(createIssueDeliverableSchema),
    async (req, res) => {
      const issue = await loadIssue(req.params.issueId as string);
      if (!hasCompanyAccess(req, issue.companyId)) throw notFound("Issue not found");
      assertCompanyAccess(req, issue.companyId);
      if (issue.deliveryTaskType !== "deliverable") {
        throw unprocessable("Deliverables can only be added to deliverable tasks");
      }
      const reviewerMembership = await db.select({ id: companyMemberships.id })
        .from(companyMemberships)
        .where(and(
          eq(companyMemberships.companyId, issue.companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, req.body.finalReviewerUserId),
          eq(companyMemberships.status, "active"),
        ))
        .then((rows) => rows[0] ?? null);
      if (!reviewerMembership) {
        throw unprocessable("Final reviewer must be an active user in the issue company");
      }
      const deliverable = await db.insert(issueDeliverables).values({
        companyId: issue.companyId,
        projectId: issue.projectId!,
        issueId: issue.id,
        title: req.body.title,
        isRequired: req.body.isRequired,
        finalReviewerUserId: req.body.finalReviewerUserId,
      }).returning().then((rows) => rows[0]!);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "issue.deliverable_created",
        entityType: "issue",
        entityId: issue.id,
        issueId: issue.id,
        details: { deliverableId: deliverable.id, required: deliverable.isRequired },
      });
      res.status(201).json({ ...deliverable, versions: [] });
    },
  );

  router.post(
    "/issues/:issueId/deliverables/:deliverableId/versions",
    validate(submitIssueDeliverableVersionSchema),
    async (req, res) => {
      const issue = await loadIssue(req.params.issueId as string);
      if (!hasCompanyAccess(req, issue.companyId)) throw notFound("Issue not found");
      assertCompanyAccess(req, issue.companyId);
      const deliverable = await db.select().from(issueDeliverables).where(and(
        eq(issueDeliverables.id, req.params.deliverableId as string),
        eq(issueDeliverables.issueId, issue.id),
      )).then((rows) => rows[0] ?? null);
      if (!deliverable) throw notFound("Deliverable not found");
      if (req.body.assetId) {
        const asset = await db.select({ id: assets.id }).from(assets).where(and(
          eq(assets.id, req.body.assetId),
          eq(assets.companyId, issue.companyId),
        )).then((rows) => rows[0] ?? null);
        if (!asset) throw unprocessable("Submitted file asset must belong to the issue company");
      }
      const actor = getActorInfo(req);
      const version = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${deliverable.id}, 0))`);
        const versionNumber = await tx.select({
          value: sql<number>`coalesce(max(${issueDeliverableVersions.versionNumber}), 0) + 1`,
        }).from(issueDeliverableVersions)
          .where(eq(issueDeliverableVersions.deliverableId, deliverable.id))
          .then((rows) => Number(rows[0]?.value ?? 1));
        return tx.insert(issueDeliverableVersions).values({
          companyId: issue.companyId,
          deliverableId: deliverable.id,
          versionNumber,
          submissionType: req.body.submissionType,
          assetId: req.body.assetId ?? null,
          url: req.body.url ?? null,
          text: req.body.text ?? null,
          changeSummary: req.body.changeSummary ?? null,
          submittedByAgentId: actor.agentId,
          submittedByUserId: actor.actorType === "user" ? actor.actorId : null,
        }).returning().then((rows) => rows[0]!);
      });
      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "issue.deliverable_version_submitted",
        entityType: "issue",
        entityId: issue.id,
        issueId: issue.id,
        details: { deliverableId: deliverable.id, versionId: version.id, versionNumber: version.versionNumber },
      });
      res.status(201).json(version);
    },
  );

  router.post(
    "/issues/:issueId/deliverables/:deliverableId/versions/:versionId/review",
    validate(reviewIssueDeliverableVersionSchema),
    async (req, res) => {
      const issue = await loadIssue(req.params.issueId as string);
      if (!hasCompanyAccess(req, issue.companyId)) throw notFound("Issue not found");
      assertCompanyAccess(req, issue.companyId);
      const actor = getActorInfo(req);
      if (actor.actorType !== "user") throw forbidden("Final deliverable review requires a human user");
      const deliverable = await db.select().from(issueDeliverables).where(and(
        eq(issueDeliverables.id, req.params.deliverableId as string),
        eq(issueDeliverables.issueId, issue.id),
      )).then((rows) => rows[0] ?? null);
      if (!deliverable) throw notFound("Deliverable not found");
      if (deliverable.finalReviewerUserId !== actor.actorId) {
        throw forbidden("Only the designated final reviewer can decide this deliverable");
      }
      const version = await db.transaction(async (tx) => {
        const updated = await tx.update(issueDeliverableVersions).set({
          status: req.body.decision,
          reviewedByUserId: actor.actorId,
          reviewNote: req.body.note ?? null,
          reviewedAt: new Date(),
        }).where(and(
          eq(issueDeliverableVersions.id, req.params.versionId as string),
          eq(issueDeliverableVersions.deliverableId, deliverable.id),
          eq(issueDeliverableVersions.status, "submitted"),
        )).returning().then((rows) => rows[0] ?? null);
        if (!updated) throw unprocessable("Only a submitted deliverable version can be reviewed");
        if (req.body.decision === "approved") {
          await tx.update(issueDeliverables).set({
            officialVersionId: updated.id,
            updatedAt: new Date(),
          }).where(eq(issueDeliverables.id, deliverable.id));
        }
        return updated;
      });
      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: req.body.decision === "approved"
          ? "issue.deliverable_version_approved"
          : "issue.deliverable_version_rejected",
        entityType: "issue",
        entityId: issue.id,
        issueId: issue.id,
        details: { deliverableId: deliverable.id, versionId: version.id },
      });
      res.json(version);
    },
  );

  return router;
}
