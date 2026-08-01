import {
  assertSlice3OwnerOrganization,
  assertProjectCommentShape,
  assertSlice4Transition,
  buildInternalProjectSlug,
  buildProjectCode,
  isRoleAssignmentActive,
  isProjectContentEditable,
  isSlice3MutableProjectVisibility,
  normalizeOptionalProjectText,
  normalizeProjectTitle,
  ProjectDomainError,
  normalizeReviewText,
  validateProjectDateRange,
  type ApprovalDecision,
  type Project,
  type ProjectCommentKind,
  type ProjectMode,
  type ProjectStatus,
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
  ProjectTransaction,
  ProjectOwnerOption,
  ApprovalRequestRecord,
  ProjectCommentRecord,
  ProjectReviewHistory,
  ReviewQueueCursor,
  ReviewQueueItem,
  ReviewQueuePage
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

export interface ProjectWorkflowInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly projectId: string;
  readonly expectedVersion: number;
}

export interface ProjectReviewInput extends ProjectWorkflowInput {
  readonly approvalRequestId: string;
}

export interface ProjectDecisionInput extends ProjectReviewInput {
  readonly reason?: string | null;
}

export interface AddProjectCommentInput extends RequestContext {
  readonly actor: ActorContext;
  readonly tenantId: string;
  readonly projectId: string;
  readonly approvalRequestId: string;
  readonly kind: ProjectCommentKind;
  readonly fieldKey?: string | null;
  readonly body: string;
}

export class ProjectUseCases {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async createProjectDraft(input: CreateProjectDraftInput): Promise<ProjectDetails> {
    const title = domainValidation(() => normalizeProjectTitle(input.title));
    const fields = domainValidation(() => normalizeDraftFields(input));
    domainValidation(() =>
      validateProjectDateRange(fields.plannedStartAt, fields.plannedEndAt, "PROJECT_PLANNED_DATES_INVALID")
    );
    domainValidation(() =>
      validateProjectDateRange(fields.actualStartAt, fields.actualEndAt, "PROJECT_ACTUAL_DATES_INVALID")
    );

    return this.repository.transaction(async (transaction) => {
      const tenantPerson = await transaction.findPersonForAccountInTenant(
        input.tenantId,
        input.actor.account.id
      );
      if (tenantPerson === null) {
        throw new ValidationError("A tenant Person is required to create a project.", "PROJECT_PERSON_REQUIRED", 403);
      }
      const owner = await transaction.findOwnerOrganization(input.tenantId, input.ownerOrganizationId);
      if (owner === null) {
        throw new NotFoundError("Project owner organization not found.");
      }
      domainValidation(() => assertSlice3OwnerOrganization(owner));
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
        projectLeadPersonId: tenantPerson.id,
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

  getProjectCapabilities(input: {
    readonly actor: ActorContext;
    readonly project: ProjectDetails;
  }): {
    readonly canUpdate: boolean;
    readonly canSubmit: boolean;
    readonly canStartReview: boolean;
    readonly canComment: boolean;
    readonly canRequestChanges: boolean;
    readonly canApprove: boolean;
    readonly canReject: boolean;
  } {
    const resource = resourceFromDetails(input.project);
    const now = this.clock.now();
    return {
      canUpdate: isProjectContentEditable(input.project.project.status) &&
        canAccessProject(input.actor, "project.update", resource, { now }).effect === "allow",
      canSubmit: (input.project.project.status === "DRAFT" || input.project.project.status === "CHANGES_REQUESTED") &&
        canAccessProject(input.actor, "project.submit", resource, { now }).effect === "allow",
      canStartReview: input.project.project.status === "READY_FOR_REVIEW" &&
        canAccessProject(input.actor, "project.review", resource, { now }).effect === "allow" &&
        !isSelfReviewer(input.actor.account.id, input.project.project, null),
      canComment: ["READY_FOR_REVIEW", "IN_REVIEW", "CHANGES_REQUESTED"].includes(input.project.project.status) &&
        canAccessProject(input.actor, "project.comment", resource, { now }).effect === "allow",
      canRequestChanges: input.project.project.status === "IN_REVIEW" &&
        canAccessProject(input.actor, "project.request_changes", resource, { now }).effect === "allow" &&
        !isSelfReviewer(input.actor.account.id, input.project.project, null),
      canApprove: input.project.project.status === "IN_REVIEW" &&
        canAccessProject(input.actor, "project.approve", resource, { now }).effect === "allow" &&
        !isSelfReviewer(input.actor.account.id, input.project.project, null),
      canReject: input.project.project.status === "IN_REVIEW" &&
        canAccessProject(input.actor, "project.reject", resource, { now }).effect === "allow" &&
        !isSelfReviewer(input.actor.account.id, input.project.project, null)
    };
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
    return this.updateProjectContent(input);
  }

  async updateProjectContent(input: UpdateProjectDraftInput): Promise<ProjectDetails> {
    return this.repository.transaction(async (transaction) => {
      const current = await transaction.findProjectById(input.tenantId, input.projectId);
      if (current === null) {
        throw new NotFoundError("Project not found.");
      }
      if (!isProjectContentEditable(current.project.status)) {
        throw new ValidationError("Project content is frozen in the current status.", "PROJECT_CONTENT_FROZEN", 403);
      }
      assertProjectPolicy(input.actor, "project.update", resourceFromDetails(current), this.clock.now());

      const patch = buildProjectPatch(input);
      domainValidation(() =>
        validateProjectDateRange(
          patch.plannedStartAt === undefined ? current.project.plannedStartAt : patch.plannedStartAt,
          patch.plannedEndAt === undefined ? current.project.plannedEndAt : patch.plannedEndAt,
          "PROJECT_PLANNED_DATES_INVALID"
        )
      );
      domainValidation(() =>
        validateProjectDateRange(
          patch.actualStartAt === undefined ? current.project.actualStartAt : patch.actualStartAt,
          patch.actualEndAt === undefined ? current.project.actualEndAt : patch.actualEndAt,
          "PROJECT_ACTUAL_DATES_INVALID"
        )
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

  async submitProjectForReview(input: ProjectWorkflowInput): Promise<{
    readonly project: ProjectDetails;
    readonly approvalRequest: ApprovalRequestRecord;
  }> {
    return this.repository.transaction(async (transaction) => {
      const current = await transaction.findProjectByIdForUpdate(input.tenantId, input.projectId);
      if (current === null) {
        throw new NotFoundError("Project not found.");
      }
      if (current.project.version !== input.expectedVersion) {
        throw new ConflictError("Project was modified by another request.");
      }
      if (current.project.status !== "DRAFT" && current.project.status !== "CHANGES_REQUESTED") {
        throw new ValidationError("Project cannot be submitted from the current status.", "PROJECT_TRANSITION_INVALID", 422);
      }
      domainValidation(() => assertSlice3OwnerOrganization(current.owner));
      assertProjectReadyForReview(current);
      assertProjectPolicy(input.actor, "project.submit", resourceFromDetails(current), this.clock.now());
      const pendingEvidenceUploads = await transaction.countPendingEvidenceUploadsForProject({
        tenantId: input.tenantId,
        projectId: input.projectId,
        now: this.clock.now()
      });
      if (pendingEvidenceUploads > 0) {
        throw new ValidationError("Project cannot be submitted while evidence verification is in progress.", "PROJECT_EVIDENCE_UPLOADS_PENDING", 409);
      }

      const submittedVersion = current.project.version;
      const request = await transaction.createApprovalRequest({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        projectId: input.projectId,
        submittedProjectVersion: submittedVersion,
        requestedByAccountId: input.actor.account.id,
        requestedAt: this.clock.now()
      });
      const project = await this.transitionProject(transaction, {
        current,
        actor: input.actor,
        expectedVersion: input.expectedVersion,
        toStatus: "READY_FOR_REVIEW",
        approvalRequestId: request.id,
        reason: null,
        requestId: input.requestId,
        auditAction: "project.submitted_for_review"
      });
      return { project, approvalRequest: request };
    });
  }

  async startProjectReview(input: ProjectReviewInput): Promise<ProjectDetails> {
    return this.withPendingReview(input, "project.review", async (transaction, current, request) => {
      if (current.project.status !== "READY_FOR_REVIEW") {
        throw new ValidationError("Project review cannot be started from the current status.", "PROJECT_TRANSITION_INVALID", 422);
      }
      assertNotSelfReview(input.actor.account.id, current.project, request);
      return this.transitionProject(transaction, {
        current,
        actor: input.actor,
        expectedVersion: input.expectedVersion,
        toStatus: "IN_REVIEW",
        approvalRequestId: request.id,
        reason: null,
        requestId: input.requestId,
        auditAction: "project.review_started"
      });
    });
  }

  async requestProjectChanges(input: ProjectDecisionInput): Promise<ProjectDetails> {
    const reason = domainValidation(() => normalizeReviewText(input.reason ?? "", "PROJECT_REVIEW_REASON_REQUIRED"));
    return this.decideProject(input, "CHANGES_REQUESTED", "project.request_changes", reason, "project.changes_requested");
  }

  async approveProjectForExecution(input: ProjectDecisionInput): Promise<ProjectDetails> {
    const rawReason = input.reason;
    const reason = rawReason === null || rawReason === undefined
      ? null
      : domainValidation(() => normalizeReviewText(rawReason, "PROJECT_REVIEW_REASON_REQUIRED"));
    return this.decideProject(input, "APPROVED", "project.approve", reason, "project.approved_for_execution");
  }

  async rejectProject(input: ProjectDecisionInput): Promise<ProjectDetails> {
    const reason = domainValidation(() => normalizeReviewText(input.reason ?? "", "PROJECT_REVIEW_REASON_REQUIRED"));
    return this.decideProject(input, "REJECTED", "project.reject", reason, "project.rejected");
  }

  async addProjectComment(input: AddProjectCommentInput): Promise<ProjectCommentRecord> {
    const comment = domainValidation(() => assertProjectCommentShape({
      kind: input.kind,
      fieldKey: input.fieldKey ?? null,
      body: input.body
    }));
    return this.repository.transaction(async (transaction) => {
      // Comments follow the same Project -> ApprovalRequest lock order as
      // transitions. Otherwise a resubmission can create a newer cycle while a
      // comment is still being attached to the old CHANGES_REQUESTED request.
      const current = await transaction.findProjectByIdForUpdate(input.tenantId, input.projectId);
      if (current === null) {
        throw new NotFoundError("Project not found.");
      }
      const request = await transaction.findApprovalRequestByIdForUpdate(input.tenantId, input.approvalRequestId);
      if (request === null || request.projectId !== input.projectId) {
        throw new NotFoundError("Review cycle not found.");
      }
      const latestRequest = await transaction.findLatestApprovalRequestForProject(input.tenantId, input.projectId);
      if (latestRequest === null || latestRequest.id !== request.id) {
        throw new ValidationError("Review comments must target the current review cycle.", "PROJECT_COMMENT_REVIEW_CYCLE_INVALID", 409);
      }
      if (!["READY_FOR_REVIEW", "IN_REVIEW", "CHANGES_REQUESTED"].includes(current.project.status)) {
        throw new ValidationError("Project cannot receive review comments in the current status.", "PROJECT_COMMENT_STATUS_INVALID", 422);
      }
      // A current cycle is identified by the highest submitted_project_version,
      // not by status. Multiple historical cycles can be CHANGES_REQUESTED.
      if (
        ((current.project.status === "READY_FOR_REVIEW" || current.project.status === "IN_REVIEW") &&
          request.status !== "PENDING") ||
        (current.project.status === "CHANGES_REQUESTED" && request.status !== "CHANGES_REQUESTED")
      ) {
        throw new ValidationError("Review comments must target the current review cycle.", "PROJECT_COMMENT_REVIEW_CYCLE_INVALID", 409);
      }
      assertProjectPolicy(input.actor, "project.comment", resourceFromDetails(current), this.clock.now());
      const created = await transaction.appendProjectComment({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        projectId: input.projectId,
        approvalRequestId: input.approvalRequestId,
        authorAccountId: input.actor.account.id,
        kind: input.kind,
        fieldKey: comment.fieldKey,
        body: comment.body,
        createdAt: this.clock.now()
      });
      await transaction.appendAuditEvent(projectAuditEvent({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        resourceId: input.projectId,
        action: "project.comment_added",
        metadata: {
          approval_request_id: input.approvalRequestId,
          field_key: comment.fieldKey
        },
        requestId: input.requestId,
        actorAccountId: input.actor.account.id
      }));
      return created;
    });
  }

  async listRegionalReviewQueue(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly limit: number;
    readonly cursor: ReviewQueueCursor | null;
    readonly status?: ApprovalRequestRecord["status"];
  }): Promise<ReviewQueuePage> {
    const scopePaths = scopePathsFor(input.actor, input.tenantId, "project.review", this.clock.now());
    if (scopePaths.length === 0) {
      return { items: [], nextCursor: null };
    }
    return this.repository.transaction(async (transaction) => {
      const page = await transaction.listReviewQueueForScopes({
        tenantId: input.tenantId,
        scopePaths,
        limit: input.limit,
        cursor: input.cursor,
        status: input.status ?? "PENDING"
      });
      return {
        ...page,
        items: page.items.map((item) => ({
          ...item,
          capabilities: reviewQueueCapabilities(input.actor, item, this.clock.now())
        }))
      };
    });
  }

  async getProjectReviewHistory(input: {
    readonly actor: ActorContext;
    readonly tenantId: string;
    readonly projectId: string;
  }): Promise<ProjectReviewHistory> {
    return this.repository.transaction(async (transaction) => {
      const current = await transaction.findProjectById(input.tenantId, input.projectId);
      if (current === null) {
        throw new NotFoundError("Project not found.");
      }
      assertProjectPolicy(input.actor, "project.read", resourceFromDetails(current), this.clock.now());
      return transaction.listProjectReviewHistory(input.tenantId, input.projectId);
    });
  }

  private async withPendingReview<TResult>(
    input: ProjectReviewInput,
    action: ProjectAction,
    handler: (
      transaction: ProjectTransaction,
      current: ProjectDetails,
      request: ApprovalRequestRecord
    ) => Promise<TResult>
  ): Promise<TResult> {
    return this.repository.transaction(async (transaction) => {
      // Workflow mutations always lock Project first, then ApprovalRequest. Keeping
      // this order stable avoids preventable deadlocks between reviewers.
      const current = await transaction.findProjectByIdForUpdate(input.tenantId, input.projectId);
      if (current === null) {
        throw new NotFoundError("Project not found.");
      }
      if (current.project.version !== input.expectedVersion) {
        throw new ConflictError("Project was modified by another request.");
      }
      const request = await transaction.findApprovalRequestByIdForUpdate(input.tenantId, input.approvalRequestId);
      if (request === null || request.projectId !== input.projectId || request.status !== "PENDING") {
        throw new ConflictError("Review request is no longer pending.");
      }
      assertProjectPolicy(input.actor, action, resourceFromDetails(current), this.clock.now());
      return handler(transaction, current, request);
    });
  }

  private async decideProject(
    input: ProjectDecisionInput,
    decision: ApprovalDecision,
    action: ProjectAction,
    reason: string | null,
    auditAction: ProjectAuditAction
  ): Promise<ProjectDetails> {
    return this.withPendingReview(input, action, async (transaction, current, request) => {
      if (current.project.status !== "IN_REVIEW") {
        throw new ValidationError("Project decision requires an active review.", "PROJECT_TRANSITION_INVALID", 422);
      }
      assertNotSelfReview(input.actor.account.id, current.project, request);
      const toStatus = decisionToProjectStatus(decision);
      const decidedAt = this.clock.now();
      const approvalDecision = await transaction.appendApprovalDecision({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        approvalRequestId: request.id,
        reviewerAccountId: input.actor.account.id,
        decision,
        reason,
        decidedAt
      });
      const resolved = await transaction.resolveApprovalRequest({
        tenantId: input.tenantId,
        approvalRequestId: request.id,
        status: decision,
        resolvedAt: decidedAt
      });
      if (resolved === null) {
        throw new ConflictError("Review request is no longer pending.");
      }
      return this.transitionProject(transaction, {
        current,
        actor: input.actor,
        expectedVersion: input.expectedVersion,
        toStatus,
        approvalRequestId: request.id,
        reason,
        requestId: input.requestId,
        auditAction,
        approvalDecisionId: approvalDecision.id
      });
    });
  }

  private async transitionProject(
    transaction: ProjectTransaction,
    input: {
      readonly current: ProjectDetails;
      readonly actor: ActorContext;
      readonly expectedVersion: number;
      readonly toStatus: ProjectStatus;
      readonly approvalRequestId: string | null;
      readonly reason: string | null;
      readonly requestId?: string;
      readonly auditAction: ProjectAuditAction;
      readonly approvalDecisionId?: string;
    }
  ): Promise<ProjectDetails> {
    domainValidation(() => assertSlice4Transition(input.current.project.status, input.toStatus));
    const updated = await transaction.updateProjectStatus({
      tenantId: input.current.project.tenantId,
      projectId: input.current.project.id,
      expectedVersion: input.expectedVersion,
      fromStatus: input.current.project.status,
      toStatus: input.toStatus
    });
    if (updated === null) {
      throw new ConflictError("Project workflow state changed concurrently.");
    }
    await transaction.appendStateTransition({
      id: this.ids.generate(),
      tenantId: input.current.project.tenantId,
      projectId: input.current.project.id,
      fromState: input.current.project.status,
      toState: input.toStatus,
      actorAccountId: input.actor.account.id,
      approvalRequestId: input.approvalRequestId,
      reason: input.reason,
      occurredAt: this.clock.now()
    });
    await transaction.appendAuditEvent(projectAuditEvent({
      id: this.ids.generate(),
      tenantId: input.current.project.tenantId,
      resourceId: input.current.project.id,
      action: input.auditAction,
      metadata: {
        approval_request_id: input.approvalRequestId,
        approval_decision_id: input.approvalDecisionId,
        from_status: input.current.project.status,
        to_status: input.toStatus,
        old_version: input.current.project.version,
        new_version: updated.project.version
      },
      requestId: input.requestId,
      actorAccountId: input.actor.account.id
    }));
    return updated;
  }
}

type ProjectAction =
  | "project.create"
  | "project.read"
  | "project.update"
  | "project.submit"
  | "project.comment"
  | "project.review"
  | "project.request_changes"
  | "project.approve"
  | "project.reject";

type ProjectAuditAction =
  | "project.created"
  | "project.updated"
  | "project.submitted_for_review"
  | "project.review_started"
  | "project.comment_added"
  | "project.changes_requested"
  | "project.approved_for_execution"
  | "project.rejected";

function assertProjectPolicy(
  actor: ActorContext,
  action: ProjectAction,
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
  action: ProjectAction,
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
    const title = input.title;
    patch.title = domainValidation(() => normalizeProjectTitle(title));
  }
  if ("summary" in input) {
    patch.summary = domainValidation(() => normalizeOptionalProjectText(input.summary));
  }
  if ("problemStatement" in input) {
    patch.problemStatement = domainValidation(() => normalizeOptionalProjectText(input.problemStatement));
  }
  if ("diagnostic" in input) {
    patch.diagnostic = domainValidation(() => normalizeOptionalProjectText(input.diagnostic));
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
    patch.locationLabel = domainValidation(() => normalizeOptionalProjectText(input.locationLabel));
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

function reviewQueueCapabilities(
  actor: ActorContext,
  item: ReviewQueueItem,
  now: Date
): NonNullable<ReviewQueueItem["capabilities"]> {
  const resource: ProjectResource = {
    projectId: item.projectId,
    tenantId: item.tenantId,
    ownerOrganizationId: item.ownerOrganization.id,
    ownerOrganizationPath: item.ownerOrganization.path,
    status: item.projectStatus,
    createdByAccountId: item.createdByAccountId
  };
  const notSelfReview =
    actor.account.id !== item.createdByAccountId &&
    actor.account.id !== item.requestedByAccountId;
  return {
    canStartReview: item.projectStatus === "READY_FOR_REVIEW" &&
      canAccessProject(actor, "project.review", resource, { now }).effect === "allow" &&
      notSelfReview,
    canComment: (item.projectStatus === "READY_FOR_REVIEW" || item.projectStatus === "IN_REVIEW") &&
      canAccessProject(actor, "project.comment", resource, { now }).effect === "allow",
    canRequestChanges: item.projectStatus === "IN_REVIEW" &&
      canAccessProject(actor, "project.request_changes", resource, { now }).effect === "allow" &&
      notSelfReview,
    canApprove: item.projectStatus === "IN_REVIEW" &&
      canAccessProject(actor, "project.approve", resource, { now }).effect === "allow" &&
      notSelfReview,
    canReject: item.projectStatus === "IN_REVIEW" &&
      canAccessProject(actor, "project.reject", resource, { now }).effect === "allow" &&
      notSelfReview
  };
}

function assertProjectReadyForReview(details: ProjectDetails): void {
  const missing: string[] = [];
  if (details.project.problemStatement === null || details.project.problemStatement.trim().length === 0) {
    missing.push("problemStatement");
  }
  if (details.project.diagnostic === null || details.project.diagnostic.trim().length === 0) {
    missing.push("diagnostic");
  }
  if (details.projectLead.status !== "ACTIVE") {
    missing.push("projectLeadPerson");
  }
  if (missing.length > 0) {
    throw new ValidationError(
      `Project is not ready for review: ${missing.join(", ")}.`,
      "PROJECT_NOT_READY_FOR_REVIEW",
      422
    );
  }
}

function assertNotSelfReview(
  actorAccountId: string,
  project: Project,
  request: ApprovalRequestRecord
): void {
  if (isSelfReviewer(actorAccountId, project, request)) {
    throw new ValidationError("Project authors cannot review their own submission.", "PROJECT_SELF_REVIEW_FORBIDDEN", 403);
  }
}

function isSelfReviewer(
  actorAccountId: string,
  project: Project,
  request: ApprovalRequestRecord | null
): boolean {
  return actorAccountId === project.createdByAccountId ||
    (request !== null && actorAccountId === request.requestedByAccountId);
}

function decisionToProjectStatus(decision: ApprovalDecision): ProjectStatus {
  if (decision === "APPROVED") {
    return "APPROVED_FOR_EXECUTION";
  }
  return decision;
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
  readonly action: ProjectAuditAction;
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
  return id.replace(/-/g, "").slice(0, 12);
}

function domainValidation<TResult>(operation: () => TResult): TResult {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ProjectDomainError) {
      throw new ValidationError(error.message, error.code, 422);
    }
    throw error;
  }
}

type Mutable<T> = {
  -readonly [K in keyof T]?: T[K];
};
