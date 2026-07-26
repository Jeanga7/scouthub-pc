import {
  assertSlice3OwnerOrganization,
  buildInternalProjectSlug,
  buildProjectCode,
  isRoleAssignmentActive,
  isSlice3MutableProjectVisibility,
  normalizeOptionalProjectText,
  normalizeProjectTitle,
  validateProjectDateRange,
  type Project,
  type ProjectMode,
  type ProjectVisibility
} from "@scouthub/domain";
import {
  canAccessProject,
  type ProjectResource
} from "@scouthub/authz";
import type { ActorContext } from "../ports/identity-repository";
import {
  createAuditEvent,
  type RequestContext
} from "../organization/audit";
import { ConflictError, NotFoundError, ValidationError } from "../organization/errors";
import type { IdGenerator } from "../organization/use-cases";
import type {
  ProjectDetails,
  ProjectListFilters,
  ProjectListPage,
  ProjectPatch,
  ProjectRepository,
  ProjectOwnerOption
} from "../ports/project-repository";

export interface Clock {
  now(): Date;
}

export interface CreateProjectDraftInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly ownerOrganizationId: string;
  readonly title: string;
  readonly projectMode?: ProjectMode;
  readonly visibility?: "PRIVATE" | "INTERNAL";
  readonly summary?: string | null;
  readonly problemStatement?: string | null;
  readonly diagnostic?: string | null;
  readonly locationLabel?: string | null;
  readonly plannedStartAt?: Date | null;
  readonly plannedEndAt?: Date | null;
  readonly actualStartAt?: Date | null;
  readonly actualEndAt?: Date | null;
}

export interface UpdateProjectDraftInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly projectId: string;
  readonly expectedVersion: number;
  readonly title?: string;
  readonly summary?: string | null;
  readonly problemStatement?: string | null;
  readonly diagnostic?: string | null;
  readonly projectMode?: ProjectMode;
  readonly visibility?: ProjectVisibility;
  readonly locationLabel?: string | null;
  readonly plannedStartAt?: Date | null;
  readonly plannedEndAt?: Date | null;
  readonly actualStartAt?: Date | null;
  readonly actualEndAt?: Date | null;
}

export class ProjectUseCases {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async createProjectDraft(input: CreateProjectDraftInput): Promise<ProjectDetails> {
    const actorPerson = input.actor.person;
    if (actorPerson === null || actorPerson.tenantId !== input.tenantId) {
      throw new ValidationError("A tenant Person is required to create a project.", "PROJECT_PERSON_REQUIRED", 403);
    }
    const title = normalizeProjectTitle(input.title);
    const fields = normalizeDraftFields(input);
    validateProjectDateRange(fields.plannedStartAt, fields.plannedEndAt, "PROJECT_PLANNED_DATES_INVALID");
    validateProjectDateRange(fields.actualStartAt, fields.actualEndAt, "PROJECT_ACTUAL_DATES_INVALID");

    return this.repository.transaction(async (transaction) => {
      const owner = await transaction.findOwnerOrganization(input.tenantId, input.ownerOrganizationId);
      if (owner === null) {
        throw new NotFoundError("Project owner organization not found.");
      }
      assertSlice3OwnerOrganization(owner);
      assertProjectPolicy(input.actor, "project.create", {
        projectId: "new",
        tenantId: input.tenantId,
        ownerOrganizationId: owner.organizationId,
        ownerOrganizationPath: owner.path,
        status: "DRAFT",
        createdByAccountId: input.actor.account.id
      }, this.clock.now());

      const id = this.ids.generate();
      const suffix = compactSuffix(id);
      const created = await transaction.insertProject({
        id,
        tenantId: input.tenantId,
        ownerOrganizationId: owner.organizationId,
        code: buildProjectCode(suffix),
        internalSlug: buildInternalProjectSlug(title, suffix),
        title,
        summary: fields.summary,
        problemStatement: fields.problemStatement,
        diagnostic: fields.diagnostic,
        projectMode: fields.projectMode,
        status: "DRAFT",
        visibility: fields.visibility,
        locationLabel: fields.locationLabel,
        plannedStartAt: fields.plannedStartAt,
        plannedEndAt: fields.plannedEndAt,
        actualStartAt: fields.actualStartAt,
        actualEndAt: fields.actualEndAt,
        projectLeadPersonId: actorPerson.id,
        createdByAccountId: input.actor.account.id
      });
      await transaction.appendAuditEvent(projectAuditEvent({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        resourceId: created.project.id,
        action: "project.created",
        metadata: {
          owner_org_id: owner.organizationId,
          version: created.project.version
        },
        requestId: input.requestId,
        actorAccountId: input.actor.account.id
      }));
      return created;
    });
  }

  async getProject(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly projectId: string;
  }): Promise<ProjectDetails> {
    return this.repository.transaction(async (transaction) => {
      const details = await transaction.findProjectById(input.tenantId, input.projectId);
      if (details === null) {
        throw new NotFoundError("Project not found.");
      }
      assertProjectPolicy(input.actor, "project.read", resourceFromDetails(details), this.clock.now());
      return details;
    });
  }

  async listProjects(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly limit: number;
    readonly cursor: { readonly updatedAt: Date; readonly id: string } | null;
    readonly filters: ProjectListFilters;
  }): Promise<ProjectListPage> {
    const scopePaths = scopePathsFor(input.actor, input.tenantId, "project.read", this.clock.now());
    if (scopePaths.length === 0) {
      return { projects: [], nextCursor: null };
    }
    return this.repository.transaction((transaction) =>
      transaction.listProjectsForScopes({
        tenantId: input.tenantId,
        scopePaths,
        limit: input.limit,
        cursor: input.cursor,
        filters: input.filters
      })
    );
  }

  async listProjectOwnerOptions(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
  }): Promise<ProjectOwnerOption[]> {
    const scopePaths = scopePathsFor(input.actor, input.tenantId, "project.create", this.clock.now());
    if (scopePaths.length === 0) {
      return [];
    }
    return this.repository.transaction((transaction) =>
      transaction.listProjectOwnerOptionsForScopes(input.tenantId, scopePaths)
    );
  }

  async updateProjectDraft(input: UpdateProjectDraftInput): Promise<ProjectDetails> {
    return this.repository.transaction(async (transaction) => {
      const current = await transaction.findProjectById(input.tenantId, input.projectId);
      if (current === null) {
        throw new NotFoundError("Project not found.");
      }
      if (current.project.status !== "DRAFT") {
        throw new ValidationError("Only DRAFT projects can be updated.", "PROJECT_STATUS_NOT_DRAFT", 403);
      }
      assertProjectPolicy(input.actor, "project.update", resourceFromDetails(current), this.clock.now());

      const patch = buildProjectPatch(input);
      validateProjectDateRange(
        patch.plannedStartAt === undefined ? current.project.plannedStartAt : patch.plannedStartAt,
        patch.plannedEndAt === undefined ? current.project.plannedEndAt : patch.plannedEndAt,
        "PROJECT_PLANNED_DATES_INVALID"
      );
      validateProjectDateRange(
        patch.actualStartAt === undefined ? current.project.actualStartAt : patch.actualStartAt,
        patch.actualEndAt === undefined ? current.project.actualEndAt : patch.actualEndAt,
        "PROJECT_ACTUAL_DATES_INVALID"
      );

      const updated = await transaction.updateProject(
        input.tenantId,
        input.projectId,
        input.expectedVersion,
        patch
      );
      if (updated === null) {
        throw new ConflictError("Project was modified by another request.");
      }
      await transaction.appendAuditEvent(projectAuditEvent({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        resourceId: updated.project.id,
        action: "project.updated",
        metadata: {
          changed_fields: changedFields(current.project, updated.project),
          old_version: current.project.version,
          new_version: updated.project.version
        },
        requestId: input.requestId,
        actorAccountId: input.actor.account.id
      }));
      return updated;
    });
  }
}

function assertProjectPolicy(
  actor: ActorContext,
  action: "project.create" | "project.read" | "project.update",
  resource: ProjectResource,
  now: Date
): void {
  const decision = canAccessProject(actor, action, resource, { now });
  if (decision.effect === "deny") {
    throw new ValidationError("Permission denied.", decision.reasonCode, 403);
  }
}

function scopePathsFor(
  actor: ActorContext,
  tenantId: string,
  action: "project.create" | "project.read",
  now: Date
): string[] {
  const paths = new Set<string>();
  for (const assignment of actor.assignments) {
    if (
      assignment.tenantId === tenantId &&
      assignment.roleCode !== "PLATFORM_ADMIN" &&
      isRoleAssignmentActive(assignment, now) &&
      assignment.permissions.includes(action) &&
      assignment.scopePath !== null
    ) {
      paths.add(assignment.scopePath);
    }
  }
  return [...paths];
}

function buildProjectPatch(input: UpdateProjectDraftInput): ProjectPatch {
  const patch: Mutable<ProjectPatch> = {};
  if (input.title !== undefined) {
    patch.title = normalizeProjectTitle(input.title);
  }
  if ("summary" in input) {
    patch.summary = normalizeOptionalProjectText(input.summary);
  }
  if ("problemStatement" in input) {
    patch.problemStatement = normalizeOptionalProjectText(input.problemStatement);
  }
  if ("diagnostic" in input) {
    patch.diagnostic = normalizeOptionalProjectText(input.diagnostic);
  }
  if (input.projectMode !== undefined) {
    patch.projectMode = input.projectMode;
  }
  if (input.visibility !== undefined) {
    if (!isSlice3MutableProjectVisibility(input.visibility)) {
      throw new ValidationError("Project visibility is not allowed in Slice 3.", "PROJECT_VISIBILITY_FORBIDDEN");
    }
    patch.visibility = input.visibility;
  }
  if ("locationLabel" in input) {
    patch.locationLabel = normalizeOptionalProjectText(input.locationLabel);
  }
  if ("plannedStartAt" in input) {
    patch.plannedStartAt = input.plannedStartAt ?? null;
  }
  if ("plannedEndAt" in input) {
    patch.plannedEndAt = input.plannedEndAt ?? null;
  }
  if ("actualStartAt" in input) {
    patch.actualStartAt = input.actualStartAt ?? null;
  }
  if ("actualEndAt" in input) {
    patch.actualEndAt = input.actualEndAt ?? null;
  }
  if (Object.keys(patch).length === 0) {
    throw new ValidationError("At least one mutable project field is required.", "PROJECT_UPDATE_EMPTY");
  }
  return patch;
}

function normalizeDraftFields(input: CreateProjectDraftInput): {
  readonly summary: string | null;
  readonly problemStatement: string | null;
  readonly diagnostic: string | null;
  readonly projectMode: ProjectMode;
  readonly visibility: "PRIVATE" | "INTERNAL";
  readonly locationLabel: string | null;
  readonly plannedStartAt: Date | null;
  readonly plannedEndAt: Date | null;
  readonly actualStartAt: Date | null;
  readonly actualEndAt: Date | null;
} {
  return {
    summary: normalizeOptionalProjectText(input.summary),
    problemStatement: normalizeOptionalProjectText(input.problemStatement),
    diagnostic: normalizeOptionalProjectText(input.diagnostic),
    projectMode: input.projectMode ?? "PLANNED",
    visibility: input.visibility ?? "PRIVATE",
    locationLabel: normalizeOptionalProjectText(input.locationLabel),
    plannedStartAt: input.plannedStartAt ?? null,
    plannedEndAt: input.plannedEndAt ?? null,
    actualStartAt: input.actualStartAt ?? null,
    actualEndAt: input.actualEndAt ?? null
  };
}

function resourceFromDetails(details: ProjectDetails): ProjectResource {
  return {
    projectId: details.project.id,
    tenantId: details.project.tenantId,
    ownerOrganizationId: details.owner.organizationId,
    ownerOrganizationPath: details.owner.path,
    status: details.project.status,
    createdByAccountId: details.project.createdByAccountId
  };
}

function changedFields(before: Project, after: Project): string[] {
  const fields: string[] = [];
  for (const field of [
    "title",
    "summary",
    "problemStatement",
    "diagnostic",
    "projectMode",
    "visibility",
    "locationLabel"
  ] as const) {
    if (before[field] !== after[field]) {
      fields.push(field);
    }
  }
  for (const field of [
    "plannedStartAt",
    "plannedEndAt",
    "actualStartAt",
    "actualEndAt"
  ] as const) {
    if ((before[field]?.toISOString() ?? null) !== (after[field]?.toISOString() ?? null)) {
      fields.push(field);
    }
  }
  return fields;
}

function projectAuditEvent(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly resourceId: string;
  readonly action: "project.created" | "project.updated";
  readonly metadata: Record<string, unknown>;
  readonly requestId?: string;
  readonly actorAccountId: string;
}) {
  return createAuditEvent({
    id: input.id,
    tenantId: input.tenantId,
    resourceType: "project",
    resourceId: input.resourceId,
    action: input.action,
    metadata: input.metadata,
    requestId: input.requestId,
    auditActor: { kind: "USER", id: input.actorAccountId }
  });
}

function compactSuffix(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

type Mutable<T> = {
  -readonly [K in keyof T]?: T[K];
};
