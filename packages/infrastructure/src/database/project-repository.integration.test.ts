import { beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import type { Pool } from "pg";
import type { ActorContext } from "@scouthub/application";
import { ProjectUseCases, type IdGenerator } from "@scouthub/application";
import { createPgProjectRepository } from "./project-repository";

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
      await pool.query("TRUNCATE audit_event, approval_decision, state_transition, project_comment, approval_request, project, role_assignment, account_invitation, account_person_link, account, person, organization RESTART IDENTITY CASCADE");
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
    const approved = await useCases.approveProjectForExecution({
      actor: reviewer,
      tenantId: ids.tenant,
      projectId: ids.project,
      approvalRequestId: resubmitted.approvalRequest.id,
      expectedVersion: secondReview.project.version
    });
    expect(approved.project.status).toBe("APPROVED_FOR_EXECUTION");

    const history = await useCases.getProjectReviewHistory({
      actor: owner,
      tenantId: ids.tenant,
      projectId: ids.project
    });
    expect(history.requests).toHaveLength(2);
    expect(history.decisions.map((decision) => decision.decision)).toEqual(["CHANGES_REQUESTED", "APPROVED"]);
    expect(history.comments).toHaveLength(1);
    expect(history.transitions.map((transition) => `${transition.fromState}->${transition.toState}`)).toEqual([
      "DRAFT->READY_FOR_REVIEW",
      "READY_FOR_REVIEW->IN_REVIEW",
      "IN_REVIEW->CHANGES_REQUESTED",
      "CHANGES_REQUESTED->READY_FOR_REVIEW",
      "READY_FOR_REVIEW->IN_REVIEW",
      "IN_REVIEW->APPROVED_FOR_EXECUTION"
    ]);

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await expect(pool.query("UPDATE approval_decision SET reason = 'changed'")).rejects.toThrow();
      await expect(pool.query("DELETE FROM state_transition")).rejects.toThrow();
      await expect(pool.query("UPDATE project_comment SET body = 'changed'")).rejects.toThrow();
      const audit = await pool.query<{ action: string; actor_kind: string; metadata: Record<string, unknown> }>(
        "SELECT action, actor_kind, metadata FROM audit_event WHERE resource_type = 'project' ORDER BY occurred_at"
      );
      expect(audit.rows.map((row) => row.action)).toContain("project.approved_for_execution");
      expect(audit.rows.every((row) => row.actor_kind === "USER")).toBe(true);
      expect(JSON.stringify(audit.rows.map((row) => row.metadata))).not.toContain("Diagnostic a completer");
      expect(JSON.stringify(audit.rows.map((row) => row.metadata))).not.toContain("Preciser la methode");
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
  let auditCounter = 1;
  const generator: IdGenerator = {
    generate() {
      const next = idValues.shift();
      if (next !== undefined) {
        return next;
      }
      const suffix = String(auditCounter).padStart(12, "0");
      auditCounter += 1;
      return `eeeeeeee-eeee-4eee-8eee-${suffix}`;
    }
  };
  return new ProjectUseCases(
    createPgProjectRepository(databaseUrl),
    generator,
    { now: () => now }
  );
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

function groupBAdminActor(): ActorContext {
  return actor({
    roleCode: "GROUP_ADMIN",
    permissions: ["project.create", "project.read", "project.update"],
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
