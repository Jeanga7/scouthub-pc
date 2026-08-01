import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import type { Pool } from "pg";
import type { ActorContext, EvidenceRepository, EvidenceTransaction } from "@scouthub/application";
import { EvidenceUseCases, ProjectUseCases, type IdGenerator } from "@scouthub/application";
import { FakeObjectStorage } from "@scouthub/application";
import { createPgProjectRepository } from "./project-repository";
import { createPgEvidenceRepository } from "./evidence-repository";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://scouthub:scouthub@localhost:5433/scouthub";

const ids = {
  tenant: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  region: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  groupA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  unitA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  groupB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  tenantB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  regionB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  groupTenantB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  account: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  reviewerAccount: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4",
  person: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  reviewerPerson: "cccccccc-cccc-4ccc-8ccc-ccccccccccc5",
  personTenantB: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  project: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
  projectTwo: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
  projectTenantB: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3"
};

const now = new Date("2026-07-25T12:00:00.000Z");

describe("PgProjectRepository", () => {
  beforeEach(async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await pool.query("TRUNCATE audit_event, evidence, media_asset, approval_decision, state_transition, project_comment, approval_request, project, role_assignment, account_invitation, account_person_link, account, person, organization RESTART IDENTITY CASCADE");
      await seedBase(pool);
    } finally {
      await pool.end();
    }
  });

  it("creates, updates and audits a draft owned by an active group", async () => {
    const useCases = createUseCases([ids.project]);
    const created = await useCases.createProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire",
      projectMode: "PLANNED",
      summary: "Resume initial",
      locationLabel: "Mbour",
      plannedStartAt: new Date("2026-08-01T00:00:00.000Z"),
      requestId: "req_create"
    });

    expect(created.project.status).toBe("DRAFT");
    expect(created.project.visibility).toBe("PRIVATE");
    expect(created.project.ownerOrganizationId).toBe(ids.groupA);
    expect(created.project.createdByAccountId).toBe(ids.account);
    expect(created.project.projectLeadPersonId).toBe(ids.person);
    expect(created.project.code).toBe("PRJ-DDDDDDDDDDDD");

    const updated = await useCases.updateProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: created.project.version,
      title: "Jardin communautaire renomme",
      requestId: "req_update"
    });
    expect(updated.project.version).toBe(2);
    expect(updated.project.summary).toBe("Resume initial");
    expect(updated.project.locationLabel).toBe("Mbour");
    expect(updated.project.plannedStartAt?.toISOString()).toBe("2026-08-01T00:00:00.000Z");

    const cleared = await useCases.updateProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: updated.project.version,
      summary: null
    });
    expect(cleared.project.summary).toBeNull();

    await expect(useCases.updateProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: updated.project.version,
      title: "Stale"
    })).rejects.toThrow("modified");

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const audit = await pool.query<{ action: string; actor_kind: string; actor_id: string; metadata: Record<string, unknown> }>(
        "SELECT action, actor_kind, actor_id, metadata FROM audit_event WHERE resource_type = 'project' ORDER BY occurred_at"
      );
      expect(audit.rows.map((row) => row.action)).toEqual([
        "project.created",
        "project.updated",
        "project.updated"
      ]);
      expect(audit.rows[0]?.actor_kind).toBe("USER");
      expect(audit.rows[0]?.actor_id).toBe(ids.account);
      expect(JSON.stringify(audit.rows[1]?.metadata)).not.toContain("Jardin communautaire");
    } finally {
      await pool.end();
    }
  });

  it("rejects invalid owners and actors without tenant Person", async () => {
    const useCases = createUseCases([ids.project]);
    await expect(useCases.createProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.region,
      title: "Projet region"
    })).rejects.toMatchObject({
      code: "PROJECT_OWNER_TYPE_INVALID",
      status: 422
    });

    await expect(useCases.createProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "   "
    })).rejects.toMatchObject({
      code: "PROJECT_TITLE_REQUIRED",
      status: 422
    });

    await expect(useCases.createProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Dates invalides",
      plannedStartAt: new Date("2026-09-01T00:00:00.000Z"),
      plannedEndAt: new Date("2026-08-01T00:00:00.000Z")
    })).rejects.toMatchObject({
      code: "PROJECT_PLANNED_DATES_INVALID",
      status: 422
    });

    await expect(useCases.createProjectDraft({
      actor: tenantBWithoutPersonActor(),
      tenantId: ids.tenantB,
      ownerOrganizationId: ids.groupTenantB,
      title: "Sans personne tenant"
    })).rejects.toThrow("Person");
  });

  it("resolves the project lead Person for the target tenant", async () => {
    const useCases = createUseCases([ids.project, ids.projectTenantB]);

    const tenantAProject = await useCases.createProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Projet tenant A"
    });
    const tenantBProject = await useCases.createProjectDraft({
      actor: tenantBGroupAdminActor(),
      tenantId: ids.tenantB,
      ownerOrganizationId: ids.groupTenantB,
      title: "Projet tenant B"
    });

    expect(tenantAProject.project.projectLeadPersonId).toBe(ids.person);
    expect(tenantBProject.project.projectLeadPersonId).toBe(ids.personTenantB);
  });

  it("lists only projects covered by the same active project.read assignment", async () => {
    const useCases = createUseCases([ids.project, ids.projectTwo]);
    await useCases.createProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Nettoyage plage"
    });
    await useCases.createProjectDraft({
      actor: groupBAdminActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupB,
      title: "Bibliotheque mobile"
    });

    const groupProjects = await useCases.listProjects({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      limit: 10,
      cursor: null,
      filters: {}
    });
    expect(groupProjects.projects.map((item) => item.project.ownerOrganizationId)).toEqual([ids.groupA]);

    const regionalRead = await useCases.listProjects({
      actor: regionalReaderActor(),
      tenantId: ids.tenant,
      limit: 10,
      cursor: null,
      filters: {}
    });
    expect(regionalRead.projects).toHaveLength(2);

    const tenantB = await useCases.listProjects({
      actor: groupAdminActor(),
      tenantId: ids.tenantB,
      limit: 10,
      cursor: null,
      filters: {}
    });
    expect(tenantB.projects).toHaveLength(0);
  });

  it("lists owner options from every active project.create scope", async () => {
    const useCases = createUseCases([]);

    const options = await useCases.listProjectOwnerOptions({
      actor: multiGroupAdminActor(),
      tenantId: ids.tenant
    });

    expect(options.map((option) => option.id)).toEqual([
      ids.groupA,
      ids.unitA,
      ids.groupB
    ]);
  });

  it("runs a multi-cycle regional review with immutable decisions, comments and transitions", async () => {
    const useCases = createUseCases([ids.project]);
    const owner = projectOwnerActor();
    const reviewer = regionalReviewerActor();
    const created = await useCases.createProjectDraft({
      actor: owner,
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire",
      problemStatement: "Le quartier manque d'espaces verts.",
      diagnostic: "Les familles souhaitent un jardin partage.",
      requestId: "req_project_create"
    });

    const submitted = await useCases.submitProjectForReview({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: created.project.version,
      requestId: "req_submit_1"
    });
    expect(submitted.project.project.status).toBe("READY_FOR_REVIEW");

    await expect(useCases.startProjectReview({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.approvalRequest.id,
      expectedVersion: submitted.project.project.version
    })).rejects.toMatchObject({ code: "NO_MATCHING_ACTIVE_ASSIGNMENT", status: 403 });

    const inReview = await useCases.startProjectReview({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.approvalRequest.id,
      expectedVersion: submitted.project.project.version,
      requestId: "req_start"
    });
    expect(inReview.project.status).toBe("IN_REVIEW");

    await useCases.addProjectComment({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.approvalRequest.id,
      kind: "FIELD",
      fieldKey: "diagnostic",
      body: "Preciser la methode de diagnostic.",
      requestId: "req_comment"
    });

    const changes = await useCases.requestProjectChanges({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.approvalRequest.id,
      expectedVersion: inReview.project.version,
      reason: "Diagnostic a completer.",
      requestId: "req_changes"
    });
    expect(changes.project.status).toBe("CHANGES_REQUESTED");

    const edited = await useCases.updateProjectDraft({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: changes.project.version,
      diagnostic: "Diagnostic complete avec rencontre quartier."
    });
    const resubmitted = await useCases.submitProjectForReview({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: edited.project.version
    });
    await expect(useCases.addProjectComment({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.approvalRequest.id,
      kind: "GLOBAL",
      body: "Ancien cycle apres resoumission."
    })).rejects.toMatchObject({ code: "PROJECT_COMMENT_REVIEW_CYCLE_INVALID", status: 409 });
    const secondReview = await useCases.startProjectReview({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: resubmitted.approvalRequest.id,
      expectedVersion: resubmitted.project.project.version
    });
    const secondChanges = await useCases.requestProjectChanges({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: resubmitted.approvalRequest.id,
      expectedVersion: secondReview.project.version,
      reason: "Deuxieme cycle a completer."
    });
    expect(secondChanges.project.status).toBe("CHANGES_REQUESTED");
    await expect(useCases.addProjectComment({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.approvalRequest.id,
      kind: "GLOBAL",
      body: "Ancien cycle ferme."
    })).rejects.toMatchObject({ code: "PROJECT_COMMENT_REVIEW_CYCLE_INVALID", status: 409 });
    const currentCycleComment = await useCases.addProjectComment({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: resubmitted.approvalRequest.id,
      kind: "GLOBAL",
      body: "Commentaire sur le cycle courant."
    });
    expect(currentCycleComment.approvalRequestId).toBe(resubmitted.approvalRequest.id);

    const activeQueue = await useCases.listRegionalReviewQueue({
      actor: reviewer,
      tenantId: ids.tenant,
      limit: 10,
      cursor: null
    });
    expect(activeQueue.items).toHaveLength(0);

    const secondEdit = await useCases.updateProjectDraft({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: secondChanges.project.version,
      problemStatement: "Probleme clarifie apres deuxieme retour."
    });
    const thirdSubmit = await useCases.submitProjectForReview({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: secondEdit.project.version
    });
    const pendingQueue = await useCases.listRegionalReviewQueue({
      actor: reviewer,
      tenantId: ids.tenant,
      limit: 10,
      cursor: null
    });
    expect(pendingQueue.items.map((item) => item.approvalRequestId)).toEqual([thirdSubmit.approvalRequest.id]);
    const thirdReview = await useCases.startProjectReview({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: thirdSubmit.approvalRequest.id,
      expectedVersion: thirdSubmit.project.project.version
    });
    const approved = await useCases.approveProjectForExecution({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: thirdSubmit.approvalRequest.id,
      expectedVersion: thirdReview.project.version
    });
    expect(approved.project.status).toBe("APPROVED_FOR_EXECUTION");

    const history = await useCases.getProjectReviewHistory({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project
    });
    expect(history.requests).toHaveLength(3);
    expect(history.decisions.map((decision) => decision.decision)).toEqual(["CHANGES_REQUESTED", "CHANGES_REQUESTED", "APPROVED"]);
    expect(history.comments).toHaveLength(2);
    expect(history.transitions.map((transition) => `${transition.fromState}->${transition.toState}`)).toEqual([
      "DRAFT->READY_FOR_REVIEW",
      "READY_FOR_REVIEW->IN_REVIEW",
      "IN_REVIEW->CHANGES_REQUESTED",
      "CHANGES_REQUESTED->READY_FOR_REVIEW",
      "READY_FOR_REVIEW->IN_REVIEW",
      "IN_REVIEW->CHANGES_REQUESTED",
      "CHANGES_REQUESTED->READY_FOR_REVIEW",
      "READY_FOR_REVIEW->IN_REVIEW",
      "IN_REVIEW->APPROVED_FOR_EXECUTION"
    ]);

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await expect(pool.query("UPDATE approval_decision SET reason = 'changed'")).rejects.toThrow();
      await expect(pool.query("DELETE FROM approval_decision")).rejects.toThrow();
      await expect(pool.query("UPDATE state_transition SET reason = 'changed'")).rejects.toThrow();
      await expect(pool.query("DELETE FROM state_transition")).rejects.toThrow();
      await expect(pool.query("UPDATE project_comment SET body = 'changed'")).rejects.toThrow();
      await expect(pool.query("DELETE FROM project_comment")).rejects.toThrow();
      const reasons = await pool.query<{ decision_reason: string | null; transition_reason: string | null }>(
        `SELECT d.reason AS decision_reason, st.reason AS transition_reason
         FROM approval_decision d
         JOIN state_transition st ON st.approval_request_id = d.request_id AND st.to_state = 'CHANGES_REQUESTED'
         WHERE d.decision = 'CHANGES_REQUESTED'
         ORDER BY d.decided_at
         LIMIT 1`
      );
      expect(reasons.rows[0]?.decision_reason).toBe("Diagnostic a completer.");
      expect(reasons.rows[0]?.transition_reason).toBe("Diagnostic a completer.");
      const audit = await pool.query<{ action: string; actor_kind: string; metadata: Record<string, unknown> }>(
        "SELECT action, actor_kind, metadata FROM audit_event WHERE resource_type = 'project' ORDER BY occurred_at"
      );
      expect(audit.rows.map((row) => row.action)).toContain("project.approved_for_execution");
      expect(audit.rows.every((row) => row.actor_kind === "USER")).toBe(true);
      expect(JSON.stringify(audit.rows.map((row) => row.metadata))).not.toContain("Diagnostic a completer");
      expect(JSON.stringify(audit.rows.map((row) => row.metadata))).not.toContain("Deuxieme cycle");
      expect(JSON.stringify(audit.rows.map((row) => row.metadata))).not.toContain("Preciser la methode");
    } finally {
      await pool.end();
    }
  });

  it("denies self-review for creators and submitters even when they also hold reviewer permission", async () => {
    const creatorReviewer = ownerAndReviewerActor();
    const useCases = createUseCases([ids.project]);
    const created = await useCases.createProjectDraft({
      actor: creatorReviewer,
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire",
      problemStatement: "Le quartier manque d'espaces verts.",
      diagnostic: "Diagnostic local."
    });
    const submitted = await useCases.submitProjectForReview({
      actor: creatorReviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: created.project.version
    });

    await expect(useCases.startProjectReview({
      actor: creatorReviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.approvalRequest.id,
      expectedVersion: submitted.project.project.version
    })).rejects.toMatchObject({ code: "PROJECT_SELF_REVIEW_FORBIDDEN", status: 403 });

    const submitterReviewer = ownerAndReviewerActor({ accountId: ids.reviewerAccount, personId: ids.reviewerPerson });
    const createdByA = await useCases.createProjectDraft({
      actor: projectOwnerActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Bibliotheque mobile",
      problemStatement: "Besoin de livres.",
      diagnostic: "Diagnostic lecture."
    });
    const submittedByB = await useCases.submitProjectForReview({
      actor: submitterReviewer,
      tenantId: ids.tenant,
      projectId: createdByA.project.id,
      expectedVersion: createdByA.project.version
    });

    await expect(useCases.startProjectReview({
      actor: submitterReviewer,
      tenantId: ids.tenant,
      projectId: createdByA.project.id,
      approvalRequestId: submittedByB.approvalRequest.id,
      expectedVersion: submittedByB.project.project.version
    })).rejects.toMatchObject({ code: "PROJECT_SELF_REVIEW_FORBIDDEN", status: 403 });
  });

  it("keeps double submit and double decision transitions conflict-safe", async () => {
    const useCases = createUseCases([ids.project]);
    const owner = projectOwnerActor();
    const reviewer = regionalReviewerActor();
    const created = await useCases.createProjectDraft({
      actor: owner,
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Nettoyage plage",
      problemStatement: "Dechets sur la plage.",
      diagnostic: "Diagnostic environnemental."
    });

    const submitResults = await Promise.allSettled([
      useCases.submitProjectForReview({
        actor: owner,
        tenantId: ids.tenant,
        projectId: ids.project,
        expectedVersion: created.project.version,
        requestId: "submit_a"
      }),
      useCases.submitProjectForReview({
        actor: owner,
        tenantId: ids.tenant,
        projectId: ids.project,
        expectedVersion: created.project.version,
        requestId: "submit_b"
      })
    ]);
    expect(submitResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(submitResults.filter((result) => result.status === "rejected")).toHaveLength(1);
    const submitted = submitResults.find((result) => result.status === "fulfilled");
    if (submitted?.status !== "fulfilled") {
      throw new Error("Expected one successful submission.");
    }

    const inReview = await useCases.startProjectReview({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.value.approvalRequest.id,
      expectedVersion: submitted.value.project.project.version
    });
    const decisionResults = await Promise.allSettled([
      useCases.approveProjectForExecution({
        actor: reviewer,
        tenantId: ids.tenant,
        projectId: ids.project,
        approvalRequestId: submitted.value.approvalRequest.id,
        expectedVersion: inReview.project.version
      }),
      useCases.requestProjectChanges({
        actor: reviewer,
        tenantId: ids.tenant,
        projectId: ids.project,
        approvalRequestId: submitted.value.approvalRequest.id,
        expectedVersion: inReview.project.version,
        reason: "Correction concurrente."
      })
    ]);
    expect(decisionResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(decisionResults.filter((result) => result.status === "rejected")).toHaveLength(1);

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const counts = await pool.query<{ requests: string; submitted_audits: string; submit_transitions: string; decisions: string; terminal_transitions: string }>(
        `SELECT
          (SELECT count(*) FROM approval_request WHERE resource_id = $1) AS requests,
          (SELECT count(*) FROM audit_event WHERE resource_id = $1 AND action = 'project.submitted_for_review') AS submitted_audits,
          (SELECT count(*) FROM state_transition WHERE entity_id = $1 AND from_state = 'DRAFT' AND to_state = 'READY_FOR_REVIEW') AS submit_transitions,
          (SELECT count(*) FROM approval_decision WHERE request_id = $2) AS decisions,
          (SELECT count(*) FROM state_transition WHERE entity_id = $1 AND to_state IN ('APPROVED_FOR_EXECUTION', 'CHANGES_REQUESTED')) AS terminal_transitions`,
        [ids.project, submitted.value.approvalRequest.id]
      );
      expect(counts.rows[0]).toEqual({
        requests: "1",
        submitted_audits: "1",
        submit_transitions: "1",
        decisions: "1",
        terminal_transitions: "1"
      });
    } finally {
      await pool.end();
    }
  });

  it("serializes comments against resubmission of the same review cycle", async () => {
    const useCases = createUseCases([ids.project]);
    const owner = projectOwnerActor();
    const reviewer = regionalReviewerActor();
    const created = await useCases.createProjectDraft({
      actor: owner,
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire",
      problemStatement: "Probleme initial.",
      diagnostic: "Diagnostic initial."
    });
    const submitted = await useCases.submitProjectForReview({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: created.project.version
    });
    const inReview = await useCases.startProjectReview({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.approvalRequest.id,
      expectedVersion: submitted.project.project.version
    });
    const changes = await useCases.requestProjectChanges({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: submitted.approvalRequest.id,
      expectedVersion: inReview.project.version,
      reason: "A clarifier."
    });
    const edited = await useCases.updateProjectDraft({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project,
      expectedVersion: changes.project.version,
      diagnostic: "Diagnostic clarifie."
    });

    const results = await Promise.allSettled([
      useCases.addProjectComment({
        actor: reviewer,
        tenantId: ids.tenant,
        projectId: ids.project,
        approvalRequestId: submitted.approvalRequest.id,
        kind: "GLOBAL",
        body: "Commentaire potentiellement concurrent."
      }),
      useCases.submitProjectForReview({
        actor: owner,
        tenantId: ids.tenant,
        projectId: ids.project,
        expectedVersion: edited.project.version
      })
    ]);

    const submitResult = results[1];
    expect(submitResult.status).toBe("fulfilled");
    const commentResult = results[0];
    if (commentResult.status === "rejected") {
      expect(commentResult.reason).toMatchObject({
        code: "PROJECT_COMMENT_REVIEW_CYCLE_INVALID",
        status: 409
      });
    }

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const rows = await pool.query<{ request_id: string; comments: string }>(
        `SELECT ar.id AS request_id, count(pc.id) AS comments
         FROM approval_request ar
         LEFT JOIN project_comment pc ON pc.approval_request_id = ar.id
         WHERE ar.resource_id = $1
         GROUP BY ar.id, ar.submitted_project_version
         ORDER BY ar.submitted_project_version`,
        [ids.project]
      );
      expect(rows.rows).toHaveLength(2);
      expect(Number(rows.rows[0]?.comments ?? 0)).toBeLessThanOrEqual(1);
      expect(rows.rows[1]?.request_id).not.toBe(submitted.approvalRequest.id);
    } finally {
      await pool.end();
    }
  });

  it("filters the regional review queue by pending status, region scope and tenant", async () => {
    const regionASecondProject = "abababab-abab-4aba-8aba-abababababab";
    const tenantBProject = "babababa-baba-4bab-8bab-babababababa";
    const useCases = createUseCases([
      ids.project,
      "11111111-1111-4111-8111-111111111111",
      regionASecondProject,
      "22222222-2222-4222-8222-222222222222",
      tenantBProject,
      "33333333-3333-4333-8333-333333333333"
    ]);
    const owner = projectOwnerActor();
    const reviewer = regionalReviewerActor();
    const first = await useCases.createProjectDraft({
      actor: owner,
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Projet Region A",
      problemStatement: "Probleme A.",
      diagnostic: "Diagnostic A."
    });
    const second = await useCases.createProjectDraft({
      actor: groupBSubmitterActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupB,
      title: "Projet Region A bis",
      problemStatement: "Probleme B.",
      diagnostic: "Diagnostic B."
    });
    const tenantB = await useCases.createProjectDraft({
      actor: tenantBSubmitterActor(),
      tenantId: ids.tenantB,
      ownerOrganizationId: ids.groupTenantB,
      title: "Projet Tenant B",
      problemStatement: "Probleme Beta.",
      diagnostic: "Diagnostic Beta."
    });
    const firstRequest = await useCases.submitProjectForReview({
      actor: owner,
      tenantId: ids.tenant,
      projectId: first.project.id,
      expectedVersion: first.project.version
    });
    await useCases.submitProjectForReview({
      actor: groupBSubmitterActor(),
      tenantId: ids.tenant,
      projectId: second.project.id,
      expectedVersion: second.project.version
    });
    await useCases.submitProjectForReview({
      actor: tenantBSubmitterActor(),
      tenantId: ids.tenantB,
      projectId: tenantB.project.id,
      expectedVersion: tenantB.project.version
    });
    const queue = await useCases.listRegionalReviewQueue({
      actor: reviewer,
      tenantId: ids.tenant,
      limit: 10,
      cursor: null
    });
    expect(queue.items.map((item) => item.projectId).sort()).toEqual([ids.project, regionASecondProject].sort());
    expect(queue.items.every((item) => item.tenantId === ids.tenant)).toBe(true);

    const started = await useCases.startProjectReview({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: first.project.id,
      approvalRequestId: firstRequest.approvalRequest.id,
      expectedVersion: firstRequest.project.project.version
    });
    await useCases.requestProjectChanges({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: first.project.id,
      approvalRequestId: firstRequest.approvalRequest.id,
      expectedVersion: started.project.version,
      reason: "Completer."
    });
    const pendingOnly = await useCases.listRegionalReviewQueue({
      actor: reviewer,
      tenantId: ids.tenant,
      limit: 10,
      cursor: null
    });
    expect(pendingOnly.items.map((item) => item.projectId)).toEqual([regionASecondProject]);
  });

  it("enforces Evidence media/project coherence and verified object immutability", async () => {
    const useCases = createUseCases([ids.project, ids.projectTwo]);
    await useCases.createProjectDraft({
      actor: groupAdminActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire"
    });
    await useCases.createProjectDraft({
      actor: groupBAdminActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupB,
      title: "Nettoyage plage"
    });

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const assetId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
      await pool.query(
        `INSERT INTO media_asset (
          id, tenant_id, project_id, temporary_object_key, object_key, mime,
          byte_size, sha256, etag, classification, upload_status, scan_status,
          uploaded_by_account_id, upload_expires_at, verified_at
        )
        VALUES (
          $1, $2, $3, $4, $5, 'image/jpeg',
          3, $6, 'etag-1', 'P3', 'VERIFIED', 'NOT_SCANNED',
          $7, $8, $8
        )`,
        [
          assetId,
          ids.tenant,
          ids.project,
          `tmp/evidence/${ids.tenant}/${assetId}/nonce`,
          `evidence/${ids.tenant}/${assetId}/nonce`,
          "a".repeat(64),
          ids.account,
          now
        ]
      );

      await pool.query(
        `INSERT INTO evidence (
          id, tenant_id, project_id, media_asset_id, type, title,
          visibility, validation_status, created_by_account_id
        )
        VALUES (
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', $1, $2, $3,
          'PHOTO', 'Photo synthetique', 'PRIVATE', 'UNREVIEWED', $4
        )`,
        [ids.tenant, ids.project, assetId, ids.account]
      );

      await expect(pool.query(
        `INSERT INTO evidence (
          id, tenant_id, project_id, media_asset_id, type, title,
          visibility, validation_status, created_by_account_id
        )
        VALUES (
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', $1, $2, $3,
          'PHOTO', 'Duplicate', 'PRIVATE', 'UNREVIEWED', $4
        )`,
        [ids.tenant, ids.project, assetId, ids.account]
      )).rejects.toThrow();

      await expect(pool.query(
        `INSERT INTO evidence (
          id, tenant_id, project_id, media_asset_id, type, title,
          visibility, validation_status, created_by_account_id
        )
        VALUES (
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4', $1, $2, $3,
          'PHOTO', 'Wrong project', 'PRIVATE', 'UNREVIEWED', $4
        )`,
        [ids.tenant, ids.projectTwo, assetId, ids.account]
      )).rejects.toThrow();

      await expect(pool.query(
        "UPDATE media_asset SET object_key = 'evidence/changed' WHERE id = $1",
        [assetId]
      )).rejects.toThrow("immutable");
    } finally {
      await pool.end();
    }
  });
});

async function seedBase(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO organization (id, tenant_id, parent_id, type, name, code, status, path, depth)
     VALUES
      ($1, $1, NULL, 'NSO', 'Federation Alpha', 'ALPHA', 'ACTIVE', $2, 0),
      ($3, $1, $1, 'REGION', 'Region Horizon', 'HORIZON', 'ACTIVE', $4, 1),
      ($5, $1, $3, 'GROUP', 'Groupe Baobab', 'BAOBAB', 'ACTIVE', $6, 2),
      ($7, $1, $5, 'UNIT', 'Unite Soleil', 'SOLEIL', 'ACTIVE', $8, 3),
      ($9, $1, $3, 'GROUP', 'Groupe Teranga', 'TERANGA', 'ACTIVE', $10, 2),
      ($11, $11, NULL, 'NSO', 'Association Beta', 'BETA', 'ACTIVE', $12, 0),
      ($13, $11, $11, 'REGION', 'Region Rivage', 'RIVAGE', 'ACTIVE', $14, 1),
      ($15, $11, $13, 'GROUP', 'Groupe Nebuleuse', 'NEBULEUSE', 'ACTIVE', $16, 2)`,
    [
      ids.tenant,
      `/${ids.tenant}/`,
      ids.region,
      `/${ids.tenant}/${ids.region}/`,
      ids.groupA,
      `/${ids.tenant}/${ids.region}/${ids.groupA}/`,
      ids.unitA,
      `/${ids.tenant}/${ids.region}/${ids.groupA}/${ids.unitA}/`,
      ids.groupB,
      `/${ids.tenant}/${ids.region}/${ids.groupB}/`,
      ids.tenantB,
      `/${ids.tenantB}/`,
      ids.regionB,
      `/${ids.tenantB}/${ids.regionB}/`,
      ids.groupTenantB,
      `/${ids.tenantB}/${ids.regionB}/${ids.groupTenantB}/`
    ]
  );
  await pool.query(
    `INSERT INTO person (id, tenant_id, first_name, last_name, display_name)
     VALUES
      ($1, $2, 'Awa', 'Test', 'Awa Test'),
      ($5, $2, 'Revue', 'Regionale', 'Revue Regionale'),
      ($3, $4, 'Awa', 'Beta', 'Awa Beta')`,
    [ids.person, ids.tenant, ids.personTenantB, ids.tenantB, ids.reviewerPerson]
  );
  await pool.query(
    `INSERT INTO account (id, external_identity_id, primary_email, status, email_verified_at)
     VALUES
      ($1, 'user_test', 'awa@example.test', 'ACTIVE', $2),
      ($3, 'user_reviewer', 'reviewer@example.test', 'ACTIVE', $2)`,
    [ids.account, now, ids.reviewerAccount]
  );
  await pool.query(
    `INSERT INTO account_person_link (account_id, tenant_id, person_id)
     VALUES
      ($1, $2, $3),
      ($6, $2, $7),
      ($1, $4, $5)`,
    [ids.account, ids.tenant, ids.person, ids.tenantB, ids.personTenantB, ids.reviewerAccount, ids.reviewerPerson]
  );
}

function createUseCases(idValues: string[]): ProjectUseCases {
  return new ProjectUseCases(
    createPgProjectRepository(databaseUrl),
    makeIdGenerator(idValues),
    { now: () => now }
  );
}

function createEvidenceUseCases(storage: FakeObjectStorage, idValues: string[]): EvidenceUseCases {
  return new EvidenceUseCases(
    createPgEvidenceRepository(databaseUrl),
    storage,
    makeIdGenerator(idValues),
    { now: () => now }
  );
}

// `fallbackPrefix` keeps generated ids unique across the generators used within
// a single test: without it two generators would emit the same fallback uuids
// and collide on audit_event's primary key.
function makeIdGenerator(idValues: string[], fallbackPrefix = "eeeeeeee-eeee-4eee-8eee-"): IdGenerator {
  let auditCounter = 1;
  return {
    generate() {
      const next = idValues.shift();
      if (next !== undefined) {
        return next;
      }
      const suffix = String(auditCounter).padStart(12, "0");
      auditCounter += 1;
      return `${fallbackPrefix}${suffix}`;
    }
  };
}

async function queryMediaAsset(assetId: string): Promise<{ upload_status: string; object_key: string | null; verified_at: Date | null; rejection_code: string | null } | null> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<{ upload_status: string; object_key: string | null; verified_at: Date | null; rejection_code: string | null }>(
      "SELECT upload_status, object_key, verified_at, rejection_code FROM media_asset WHERE id = $1",
      [assetId]
    );
    return result.rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

async function queryEvidenceCount(assetId: string): Promise<number> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM evidence WHERE media_asset_id = $1",
      [assetId]
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await pool.end();
  }
}

async function queryEvidenceRejectionAuditCount(assetId: string): Promise<number> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_event WHERE resource_id = $1 AND action = 'evidence.upload_rejected'",
      [assetId]
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await pool.end();
  }
}

async function queryProjectStatus(projectId: string): Promise<string | null> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<{ status: string }>(
      "SELECT status FROM project WHERE id = $1",
      [projectId]
    );
    return result.rows[0]?.status ?? null;
  } finally {
    await pool.end();
  }
}

function hashHex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function permanentEvidenceKey(tenantId: string, assetId: string, temporaryObjectKey: string): string {
  const nonce = temporaryObjectKey.split("/").at(-1);
  if (nonce === undefined || nonce.length === 0) {
    throw new Error("Expected temporary object nonce.");
  }
  return `evidence/${tenantId}/${assetId}/${nonce}`;
}

function groupAdminActor(): ActorContext {
  return actor({
    roleCode: "GROUP_ADMIN",
    permissions: ["project.create", "project.read", "project.update"],
    scopeOrgId: ids.groupA,
    scopePath: `/${ids.tenant}/${ids.region}/${ids.groupA}/`,
    scopeType: "GROUP"
  });
}

function projectOwnerActor(): ActorContext {
  return actor({
    roleCode: "GROUP_ADMIN",
    permissions: ["project.create", "project.read", "project.update", "project.submit", "project.comment"],
    scopeOrgId: ids.groupA,
    scopePath: `/${ids.tenant}/${ids.region}/${ids.groupA}/`,
    scopeType: "GROUP"
  });
}

function evidenceOwnerActor(): ActorContext {
  return actor({
    roleCode: "GROUP_ADMIN",
    permissions: [
      "project.create",
      "project.read",
      "project.update",
      "project.submit",
      "project.comment",
      "evidence.create",
      "evidence.read",
      "evidence.download"
    ],
    scopeOrgId: ids.groupA,
    scopePath: `/${ids.tenant}/${ids.region}/${ids.groupA}/`,
    scopeType: "GROUP"
  });
}

describe("PgEvidenceRepository and EvidenceUseCases", () => {
  beforeEach(async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await pool.query("TRUNCATE audit_event, evidence, media_asset, approval_decision, state_transition, project_comment, approval_request, project, role_assignment, account_invitation, account_person_link, account, person, organization RESTART IDENTITY CASCADE");
      await seedBase(pool);
    } finally {
      await pool.end();
    }
  });

  it("persists expired rejection and audit before returning 422", async () => {
    const projectUseCases = createUseCases([ids.project]);
    await projectUseCases.createProjectDraft({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire"
    });

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const storage = new FakeObjectStorage();
    const useCases = createEvidenceUseCases(storage, [ids.projectTwo]);
    const assetId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5";
    const temporaryObjectKey = `tmp/evidence/${ids.tenant}/${assetId}/nonce`;
    try {
      await pool.query(
        `INSERT INTO media_asset (
          id, tenant_id, project_id, temporary_object_key, mime, byte_size,
          sha256, classification, uploaded_by_account_id, upload_expires_at
        )
        VALUES ($1, $2, $3, $4, 'image/jpeg', 4, $5, 'P3', $6, $7)`,
        [
          assetId,
          ids.tenant,
          ids.project,
          temporaryObjectKey,
          "a".repeat(64),
          ids.account,
          new Date("2026-07-24T12:00:00.000Z")
        ]
      );

      await expect(useCases.confirmEvidenceUpload({
        actor: evidenceOwnerActor(),
        tenantId: ids.tenant,
        projectId: ids.project,
        assetId,
        type: "PHOTO",
        title: "Photo synthetique"
      })).rejects.toMatchObject({
        code: "UPLOAD_EXPIRED",
        status: 422
      });

      const asset = await pool.query<{ upload_status: string; rejection_code: string | null }>(
        "SELECT upload_status, rejection_code FROM media_asset WHERE id = $1",
        [assetId]
      );
      expect(asset.rows[0]).toEqual({
        upload_status: "REJECTED",
        rejection_code: "UPLOAD_EXPIRED"
      });

      const audits = await pool.query<{ action: string }>(
        "SELECT action FROM audit_event WHERE resource_id = $1 ORDER BY occurred_at",
        [assetId]
      );
      expect(audits.rows.map((row) => row.action)).toEqual(["evidence.upload_rejected"]);

      await expect(useCases.confirmEvidenceUpload({
        actor: evidenceOwnerActor(),
        tenantId: ids.tenant,
        projectId: ids.project,
        assetId,
        type: "PHOTO",
        title: "Photo synthetique"
      })).rejects.toMatchObject({
        status: 409
      });

      const auditAfter = await pool.query("SELECT count(*)::int AS count FROM audit_event WHERE resource_id = $1", [assetId]);
      expect(auditAfter.rows[0]?.count).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it("keeps VERIFYING when permanent head signing fails after CopyObject", async () => {
    const projectUseCases = createUseCases([ids.project]);
    await projectUseCases.createProjectDraft({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire"
    });

    const storage = new FakeObjectStorage();
    const useCases = createEvidenceUseCases(storage, [ids.projectTwo]);
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
    const checksumHex = hashHex(bytes);
    const checksumBase64 = Buffer.from(checksumHex, "hex").toString("base64");
    const initiated = await useCases.initiateEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      filename: "proof.jpg",
      mime: "image/jpeg",
      bytes: bytes.length,
      sha256: checksumHex
    });
    const tempKey = initiated.asset.temporaryObjectKey;
    if (tempKey === null) {
      throw new Error("Expected temporary object key.");
    }
    storage.putObject(tempKey, {
      contentType: "image/jpeg",
      byteSize: bytes.length,
      checksumSha256Base64: checksumBase64,
      etag: "\"temp-etag\"",
      bytes
    });
    storage.failPermanentHeadSigning = true;

    await expect(useCases.confirmEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      assetId: initiated.asset.id,
      type: "PHOTO",
      title: "Photo synthetique"
    })).rejects.toMatchObject({
      code: "EVIDENCE_PROMOTION_AMBIGUOUS",
      status: 503
    });

    const asset = await queryMediaAsset(initiated.asset.id);
    expect(asset?.upload_status).toBe("VERIFYING");
    expect(asset?.object_key).toBeNull();
    expect(asset?.verified_at).toBeNull();
    expect(asset?.rejection_code).toBeNull();
    expect(storage.promoteCalls).toBe(1);
    expect(storage.objects.has(permanentEvidenceKey(ids.tenant, initiated.asset.id, tempKey))).toBe(true);
  });

  it("returns pending again when temp head signing fails before CopyObject", async () => {
    const projectUseCases = createUseCases([ids.project]);
    await projectUseCases.createProjectDraft({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire"
    });

    const storage = new FakeObjectStorage();
    const useCases = createEvidenceUseCases(storage, [ids.projectTwo]);
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const checksumHex = hashHex(bytes);
    const initiated = await useCases.initiateEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      filename: "proof.png",
      mime: "image/png",
      bytes: bytes.length,
      sha256: checksumHex
    });
    const tempKey = initiated.asset.temporaryObjectKey;
    if (tempKey === null) {
      throw new Error("Expected temporary object key.");
    }
    storage.putObject(tempKey, {
      contentType: "image/png",
      byteSize: bytes.length,
      checksumSha256Base64: Buffer.from(checksumHex, "hex").toString("base64"),
      etag: "\"temp-etag\"",
      bytes
    });
    storage.failTempHead = true;

    await expect(useCases.confirmEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      assetId: initiated.asset.id,
      type: "PHOTO",
      title: "Photo synthetique"
    })).rejects.toMatchObject({
      code: "EVIDENCE_STORAGE_UNAVAILABLE",
      status: 503
    });

    const asset = await queryMediaAsset(initiated.asset.id);
    expect(asset?.upload_status).toBe("PENDING_UPLOAD");
    expect(asset?.object_key).toBeNull();
    expect(storage.promoteCalls).toBe(0);
  });

  it("returns pending again when the verification body read is interrupted", async () => {
    const projectUseCases = createUseCases([ids.project]);
    await projectUseCases.createProjectDraft({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire"
    });

    const storage = new FakeObjectStorage();
    const useCases = createEvidenceUseCases(storage, [ids.projectTwo]);
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const checksumHex = hashHex(bytes);
    const initiated = await useCases.initiateEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      filename: "proof.png",
      mime: "image/png",
      bytes: bytes.length,
      sha256: checksumHex
    });
    const tempKey = initiated.asset.temporaryObjectKey;
    if (tempKey === null) {
      throw new Error("Expected temporary object key.");
    }
    storage.putObject(tempKey, {
      contentType: "image/png",
      byteSize: bytes.length,
      checksumSha256Base64: Buffer.from(checksumHex, "hex").toString("base64"),
      etag: "\"temp-etag\"",
      bytes
    });
    // HEAD succeeds and the GET starts returning bytes, then the body fails.
    storage.failTempReadBodyStream = true;

    await expect(useCases.confirmEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      assetId: initiated.asset.id,
      type: "PHOTO",
      title: "Photo synthetique"
    })).rejects.toMatchObject({
      code: "EVIDENCE_STORAGE_UNAVAILABLE",
      status: 503
    });

    const asset = await queryMediaAsset(initiated.asset.id);
    expect(asset?.upload_status).toBe("PENDING_UPLOAD");
    expect(asset?.object_key).toBeNull();
    expect(await queryEvidenceCount(initiated.asset.id)).toBe(0);
    expect(storage.promoteCalls).toBe(0);
    expect(await queryEvidenceRejectionAuditCount(initiated.asset.id)).toBe(0);
  });

  it("returns pending again when CopyObject signing fails before the request is sent", async () => {
    const projectUseCases = createUseCases([ids.project]);
    await projectUseCases.createProjectDraft({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire"
    });

    const storage = new FakeObjectStorage();
    const useCases = createEvidenceUseCases(storage, [ids.projectTwo]);
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x02]);
    const checksumHex = hashHex(bytes);
    const initiated = await useCases.initiateEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      filename: "proof.jpg",
      mime: "image/jpeg",
      bytes: bytes.length,
      sha256: checksumHex
    });
    const tempKey = initiated.asset.temporaryObjectKey;
    if (tempKey === null) {
      throw new Error("Expected temporary object key.");
    }
    storage.putObject(tempKey, {
      contentType: "image/jpeg",
      byteSize: bytes.length,
      checksumSha256Base64: Buffer.from(checksumHex, "hex").toString("base64"),
      etag: "\"temp-etag-copy\"",
      bytes
    });
    storage.failCopyBeforeRequest = true;

    await expect(useCases.confirmEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      assetId: initiated.asset.id,
      type: "PHOTO",
      title: "Photo synthetique"
    })).rejects.toMatchObject({
      code: "EVIDENCE_STORAGE_UNAVAILABLE",
      status: 503
    });

    const asset = await queryMediaAsset(initiated.asset.id);
    expect(asset?.upload_status).toBe("PENDING_UPLOAD");
    expect(storage.promoteCalls).toBe(1);
    expect(storage.objects.has(permanentEvidenceKey(ids.tenant, initiated.asset.id, tempKey))).toBe(false);
  });

  it("keeps VERIFYING when CopyObject network failure leaves promotion ambiguous", async () => {
    const projectUseCases = createUseCases([ids.project]);
    await projectUseCases.createProjectDraft({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire"
    });

    const storage = new FakeObjectStorage();
    const useCases = createEvidenceUseCases(storage, [ids.projectTwo]);
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x03]);
    const checksumHex = hashHex(bytes);
    const initiated = await useCases.initiateEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      filename: "proof.jpg",
      mime: "image/jpeg",
      bytes: bytes.length,
      sha256: checksumHex
    });
    const tempKey = initiated.asset.temporaryObjectKey;
    if (tempKey === null) {
      throw new Error("Expected temporary object key.");
    }
    storage.putObject(tempKey, {
      contentType: "image/jpeg",
      byteSize: bytes.length,
      checksumSha256Base64: Buffer.from(checksumHex, "hex").toString("base64"),
      etag: "\"temp-etag-copy-ambiguous\"",
      bytes
    });
    storage.failCopyAmbiguous = true;

    await expect(useCases.confirmEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      assetId: initiated.asset.id,
      type: "PHOTO",
      title: "Photo synthetique"
    })).rejects.toMatchObject({
      code: "EVIDENCE_PROMOTION_AMBIGUOUS",
      status: 503
    });

    const asset = await queryMediaAsset(initiated.asset.id);
    expect(asset?.upload_status).toBe("VERIFYING");
    expect(storage.promoteCalls).toBe(1);
    expect(storage.objects.has(permanentEvidenceKey(ids.tenant, initiated.asset.id, tempKey))).toBe(false);
  });

  it("serializes double confirm, submit and DB failure after promotion", async () => {
    const projectUseCases = createUseCases([ids.project, ids.projectTwo, ids.projectTenantB]);
    await projectUseCases.createProjectDraft({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Jardin communautaire"
    });
    const storage = new FakeObjectStorage();
    const evidenceUseCases = createEvidenceUseCases(storage, [ids.projectTwo]);
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
    const checksumHex = hashHex(bytes);
    const initiated = await evidenceUseCases.initiateEvidenceUpload({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      projectId: ids.project,
      filename: "proof.jpg",
      mime: "image/jpeg",
      bytes: bytes.length,
      sha256: checksumHex
    });
    const tempKey = initiated.asset.temporaryObjectKey;
    if (tempKey === null) {
      throw new Error("Expected temporary object key.");
    }
    storage.putObject(tempKey, {
      contentType: "image/jpeg",
      byteSize: bytes.length,
      checksumSha256Base64: Buffer.from(checksumHex, "hex").toString("base64"),
      etag: "\"temp-etag\"",
      bytes
    });

    const confirmResults = await Promise.allSettled([
      evidenceUseCases.confirmEvidenceUpload({
        actor: evidenceOwnerActor(),
        tenantId: ids.tenant,
        projectId: ids.project,
        assetId: initiated.asset.id,
        type: "PHOTO",
        title: "Photo synthetique"
      }),
      evidenceUseCases.confirmEvidenceUpload({
        actor: evidenceOwnerActor(),
        tenantId: ids.tenant,
        projectId: ids.project,
        assetId: initiated.asset.id,
        type: "PHOTO",
        title: "Photo synthetique"
      })
    ]);
    expect(storage.promoteCalls).toBe(1);
    expect(storage.readCalls).toBe(1);
    expect(confirmResults.some((result) => result.status === "fulfilled")).toBe(true);

    const asset = await queryMediaAsset(initiated.asset.id);
    expect(asset?.upload_status).toBe("VERIFIED");
    const evidenceCount = await queryEvidenceCount(initiated.asset.id);
    expect(evidenceCount).toBe(1);

    const sharedSubmitGenerator = makeIdGenerator(
      ["abababab-abab-4aba-8aba-abababababab"],
      "efefefef-efef-4efe-8efe-"
    );
    const submitUseCases = new ProjectUseCases(
      createPgProjectRepository(databaseUrl),
      sharedSubmitGenerator,
      { now: () => now }
    );
    const submitProject = await submitUseCases.createProjectDraft({
      actor: evidenceOwnerActor(),
      tenantId: ids.tenant,
      ownerOrganizationId: ids.groupA,
      title: "Projet concours",
      problemStatement: "Un probleme synthetique a traiter.",
      diagnostic: "Un diagnostic synthetique verifie."
    });
    const submitStorage = new FakeObjectStorage();
    const submitEvidenceUseCases = new EvidenceUseCases(
      createPgEvidenceRepository(databaseUrl),
      submitStorage,
      sharedSubmitGenerator,
      { now: () => now }
    );
    const submitBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x01]);
    const submitChecksumHex = hashHex(submitBytes);
    const submittedAssetId = "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc";
    const submittedTempKey = `tmp/evidence/${ids.tenant}/${submittedAssetId}/nonce`;
    const submitPool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await submitPool.query(
        `INSERT INTO media_asset (
          id, tenant_id, project_id, temporary_object_key, mime, byte_size,
          sha256, classification, uploaded_by_account_id, upload_expires_at
        )
        VALUES ($1, $2, $3, $4, 'image/jpeg', $5, $6, 'P3', $7, $8)`,
        [
          submittedAssetId,
          ids.tenant,
          submitProject.project.id,
          submittedTempKey,
          submitBytes.length,
          submitChecksumHex,
          ids.account,
          new Date("2026-07-26T12:00:00.000Z")
        ]
      );
      submitStorage.putObject(submittedTempKey, {
        contentType: "image/jpeg",
        byteSize: submitBytes.length,
        checksumSha256Base64: Buffer.from(submitChecksumHex, "hex").toString("base64"),
        etag: "\"temp-etag-submit\"",
        bytes: submitBytes
      });
      const submitRace = await Promise.allSettled([
        submitEvidenceUseCases.confirmEvidenceUpload({
          actor: evidenceOwnerActor(),
          tenantId: ids.tenant,
          projectId: submitProject.project.id,
          assetId: submittedAssetId,
          type: "PHOTO",
          title: "Photo synthetique"
        }),
        submitUseCases.submitProjectForReview({
          actor: evidenceOwnerActor(),
          tenantId: ids.tenant,
          projectId: submitProject.project.id,
          expectedVersion: submitProject.project.version
        })
      ]);
      const [confirmOutcome, submitOutcome] = submitRace;
      if (confirmOutcome === undefined || submitOutcome === undefined) {
        throw new Error("Expected both race outcomes.");
      }
      // The conservative strategy lets the Evidence confirmation win: whichever
      // order the row locks are acquired in, submit observes the asset as
      // PENDING_UPLOAD or VERIFYING and is rejected by the pending-evidence
      // guard rather than by readiness or any other validation.
      expect(confirmOutcome.status).toBe("fulfilled");
      expect(submitOutcome.status).toBe("rejected");
      if (submitOutcome.status !== "rejected") {
        throw new Error("Expected submit to be rejected.");
      }
      expect(submitOutcome.reason).toMatchObject({
        code: "PROJECT_EVIDENCE_UPLOADS_PENDING",
        status: 409
      });

      expect(await queryProjectStatus(submitProject.project.id)).toBe("DRAFT");
      expect(await queryEvidenceCount(submittedAssetId)).toBe(1);
      const raceAsset = await queryMediaAsset(submittedAssetId);
      expect(raceAsset?.upload_status).toBe("VERIFIED");
      expect(submitStorage.readCalls).toBe(1);
      expect(submitStorage.promoteCalls).toBe(1);
    } finally {
      await submitPool.end();
    }

    const failingRepository: EvidenceRepository = {
      transaction<TResult>(handler: (transaction: EvidenceTransaction) => Promise<TResult>): Promise<TResult> {
        return createPgEvidenceRepository(databaseUrl).transaction(async (transaction: EvidenceTransaction) => {
          const failingTransaction = Object.create(transaction) as EvidenceTransaction;
          failingTransaction.insertEvidence = () => Promise.reject(new Error("simulated db failure after promotion"));
          return handler(failingTransaction);
        });
      }
    };
    const failureUseCases = new EvidenceUseCases(
      failingRepository,
      storage,
      makeIdGenerator([
        "acacacac-acac-4aca-8aca-acacacacacac",
        "adadadad-adad-4ada-8ada-adadadadadad"
      ]),
      { now: () => now }
    );
    const failureAssetId = "acacacac-acac-4aca-8aca-acacacacacaf";
    const failureTempKey = `tmp/evidence/${ids.tenant}/${failureAssetId}/nonce`;
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await pool.query(
        `INSERT INTO media_asset (
          id, tenant_id, project_id, temporary_object_key, mime, byte_size,
          sha256, classification, uploaded_by_account_id, upload_expires_at
        )
        VALUES ($1, $2, $3, $4, 'image/jpeg', $5, $6, 'P3', $7, $8)`,
        [
          failureAssetId,
          ids.tenant,
          ids.project,
          failureTempKey,
          bytes.length,
          checksumHex,
          ids.account,
          new Date("2026-07-26T12:00:00.000Z")
        ]
      );
      storage.putObject(failureTempKey, {
        contentType: "image/jpeg",
        byteSize: bytes.length,
        checksumSha256Base64: Buffer.from(checksumHex, "hex").toString("base64"),
        etag: "\"temp-etag-2\"",
        bytes
      });
      await expect(failureUseCases.confirmEvidenceUpload({
        actor: evidenceOwnerActor(),
        tenantId: ids.tenant,
        projectId: ids.project,
        assetId: failureAssetId,
        type: "PHOTO",
        title: "Photo synthetique"
      })).rejects.toThrow("simulated db failure after promotion");
      const failureState = await queryMediaAsset(failureAssetId);
      expect(failureState?.upload_status).toBe("VERIFYING");
      expect(storage.objects.has(permanentEvidenceKey(ids.tenant, failureAssetId, failureTempKey))).toBe(true);
    } finally {
      await pool.end();
    }
  });
});

function ownerAndReviewerActor(input: {
  readonly accountId?: string;
  readonly personId?: string;
} = {}): ActorContext {
  const owner = projectOwnerActor();
  const reviewer = regionalReviewerActor();
  const ownerAssignment = owner.assignments[0];
  const reviewerAssignment = reviewer.assignments[0];
  if (ownerAssignment === undefined || reviewerAssignment === undefined) {
    throw new Error("Expected owner and reviewer assignments.");
  }
  const accountId = input.accountId ?? ids.account;
  const personId = input.personId ?? ids.person;
  return {
    ...owner,
    account: {
      ...owner.account,
      id: accountId
    },
    person: owner.person === null ? null : {
      ...owner.person,
      id: personId
    },
    assignments: [
      {
        ...ownerAssignment,
        id: "ffffffff-ffff-4fff-8fff-ffffffffffa1",
        accountId
      },
      {
        ...reviewerAssignment,
        id: "ffffffff-ffff-4fff-8fff-ffffffffffa2",
        accountId
      }
    ]
  };
}

function groupBAdminActor(): ActorContext {
  return actor({
    roleCode: "GROUP_ADMIN",
    permissions: ["project.create", "project.read", "project.update"],
    scopeOrgId: ids.groupB,
    scopePath: `/${ids.tenant}/${ids.region}/${ids.groupB}/`,
    scopeType: "GROUP"
  });
}

function groupBSubmitterActor(): ActorContext {
  return actor({
    roleCode: "GROUP_ADMIN",
    permissions: ["project.create", "project.read", "project.update", "project.submit", "project.comment"],
    scopeOrgId: ids.groupB,
    scopePath: `/${ids.tenant}/${ids.region}/${ids.groupB}/`,
    scopeType: "GROUP"
  });
}

function regionalReaderActor(): ActorContext {
  return actor({
    roleCode: "REGIONAL_PROGRAMME_REVIEWER",
    permissions: ["project.read"],
    scopeOrgId: ids.region,
    scopePath: `/${ids.tenant}/${ids.region}/`,
    scopeType: "REGION"
  });
}

function regionalReviewerActor(): ActorContext {
  return actor({
    roleCode: "REGIONAL_PROGRAMME_REVIEWER",
    permissions: [
      "project.read",
      "project.comment",
      "project.review",
      "project.request_changes",
      "project.approve",
      "project.reject"
    ],
    scopeOrgId: ids.region,
    scopePath: `/${ids.tenant}/${ids.region}/`,
    scopeType: "REGION",
    accountId: ids.reviewerAccount,
    personId: ids.reviewerPerson
  });
}

function tenantBGroupAdminActor(): ActorContext {
  return actor({
    roleCode: "GROUP_ADMIN",
    permissions: ["project.create", "project.read", "project.update"],
    scopeOrgId: ids.groupTenantB,
    scopePath: `/${ids.tenantB}/${ids.regionB}/${ids.groupTenantB}/`,
    scopeType: "GROUP",
    tenantId: ids.tenantB,
    personId: ids.personTenantB
  });
}

function tenantBSubmitterActor(): ActorContext {
  return actor({
    roleCode: "GROUP_ADMIN",
    permissions: ["project.create", "project.read", "project.update", "project.submit", "project.comment"],
    scopeOrgId: ids.groupTenantB,
    scopePath: `/${ids.tenantB}/${ids.regionB}/${ids.groupTenantB}/`,
    scopeType: "GROUP",
    tenantId: ids.tenantB,
    personId: ids.personTenantB
  });
}

function tenantBWithoutPersonActor(): ActorContext {
  return actor({
    roleCode: "GROUP_ADMIN",
    permissions: ["project.create", "project.read", "project.update"],
    scopeOrgId: ids.groupTenantB,
    scopePath: `/${ids.tenantB}/${ids.regionB}/${ids.groupTenantB}/`,
    scopeType: "GROUP",
    tenantId: ids.tenantB,
    personId: null,
    accountId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4"
  });
}

function multiGroupAdminActor(): ActorContext {
  const first = groupAdminActor();
  const second = groupBAdminActor().assignments[0];
  if (second === undefined) {
    throw new Error("Expected second assignment.");
  }
  return {
    ...first,
    assignments: [...first.assignments, { ...second, id: "ffffffff-ffff-4fff-8fff-fffffffffff9" }]
  };
}

function actor(input: {
  readonly roleCode: ActorContext["assignments"][number]["roleCode"];
  readonly permissions: ActorContext["assignments"][number]["permissions"];
  readonly scopeOrgId: string;
  readonly scopePath: string;
  readonly scopeType: ActorContext["assignments"][number]["scopeType"];
  readonly tenantId?: string;
  readonly personId?: string | null;
  readonly accountId?: string;
}): ActorContext {
  const tenantId = input.tenantId ?? ids.tenant;
  const accountId = input.accountId ?? ids.account;
  const personId = input.personId === undefined ? ids.person : input.personId;
  return {
    account: {
      id: accountId,
      externalIdentityId: "user_test",
      primaryEmail: "awa@example.test",
      status: "ACTIVE",
      lastLoginAt: null,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now
    },
    person: personId === null ? null : {
      id: personId,
      tenantId,
      firstName: "Awa",
      lastName: "Test",
      displayName: "Awa Test",
      birthDate: null,
      classification: "P2",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now
    },
    assuranceLevel: "standard",
    assignments: [{
      id: "ffffffff-ffff-4fff-8fff-fffffffffff1",
      tenantId,
      accountId,
      roleId: "ffffffff-ffff-4fff-8fff-fffffffffff2",
      roleCode: input.roleCode,
      permissions: input.permissions,
      scopeType: input.scopeType,
      scopeOrgId: input.scopeOrgId,
      scopePath: input.scopePath,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: null,
      grantedByAccountId: null,
      grantedAt: new Date("2026-01-01T00:00:00.000Z"),
      revokedAt: null
    }]
  };
}
