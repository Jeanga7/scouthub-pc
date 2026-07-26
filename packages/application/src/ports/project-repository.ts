import type {
  OrganizationType,
  Person,
  Project,
  ProjectMode,
  ProjectStatus,
  ProjectVisibility
} from "@scouthub/domain";
import type { AuditEventInput } from "../organization/audit";

export interface ProjectOwnerResource {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly type: OrganizationType;
  readonly status: "DRAFT" | "ACTIVE";
  readonly path: string;
}

export interface ProjectLeadSummary {
  readonly id: string;
  readonly displayName: string;
  readonly status: "ACTIVE" | "INACTIVE" | "ANONYMIZED";
}

export interface ProjectDetails {
  readonly project: Project;
  readonly owner: ProjectOwnerResource;
  readonly projectLead: ProjectLeadSummary;
}

export interface ProjectInsert {
  readonly id: string;
  readonly tenantId: string;
  readonly ownerOrganizationId: string;
  readonly code: string;
  readonly internalSlug: string;
  readonly title: string;
  readonly summary: string | null;
  readonly problemStatement: string | null;
  readonly diagnostic: string | null;
  readonly projectMode: ProjectMode;
  readonly status: "DRAFT";
  readonly visibility: "PRIVATE" | "INTERNAL";
  readonly locationLabel: string | null;
  readonly plannedStartAt: Date | null;
  readonly plannedEndAt: Date | null;
  readonly actualStartAt: Date | null;
  readonly actualEndAt: Date | null;
  readonly projectLeadPersonId: string;
  readonly createdByAccountId: string;
}

export interface ProjectPatch {
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

export interface ProjectListFilters {
  readonly ownerOrganizationId?: string;
  readonly projectMode?: ProjectMode;
  readonly status?: "DRAFT";
}

export interface ProjectCursor {
  readonly updatedAt: Date;
  readonly id: string;
}

export interface ProjectListPage {
  readonly projects: readonly ProjectDetails[];
  readonly nextCursor: ProjectCursor | null;
}

export interface ProjectOwnerOption {
  readonly id: string;
  readonly name: string;
  readonly type: "GROUP" | "UNIT";
  readonly path: string;
}

export interface ApprovalRequestRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "CANCELLED";
  readonly submittedProjectVersion: number;
  readonly requestedByAccountId: string;
  readonly requestedAt: Date;
  readonly resolvedAt: Date | null;
}

export interface ApprovalDecisionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly approvalRequestId: string;
  readonly reviewerAccountId: string;
  readonly decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  readonly reason: string | null;
  readonly decidedAt: Date;
}

export interface StateTransitionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly entityId: string;
  readonly fromState: ProjectStatus;
  readonly toState: ProjectStatus;
  readonly actorAccountId: string;
  readonly approvalRequestId: string | null;
  readonly reason: string | null;
  readonly occurredAt: Date;
}

export interface ProjectCommentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly approvalRequestId: string;
  readonly authorAccountId: string;
  readonly kind: "GLOBAL" | "FIELD";
  readonly fieldKey: string | null;
  readonly body: string;
  readonly createdAt: Date;
}

export interface ReviewQueueCursor {
  readonly requestedAt: Date;
  readonly id: string;
}

export interface ReviewQueueItem {
  readonly approvalRequestId: string;
  readonly projectId: string;
  readonly code: string;
  readonly title: string;
  readonly ownerOrganization: {
    readonly id: string;
    readonly name: string;
    readonly type: "GROUP" | "UNIT";
  };
  readonly projectStatus: ProjectStatus;
  readonly projectVersion: number;
  readonly requestedAt: Date;
  readonly requestedByAccountId: string;
  readonly submittedProjectVersion: number;
  readonly isResubmission: boolean;
}

export interface ReviewQueuePage {
  readonly items: readonly ReviewQueueItem[];
  readonly nextCursor: ReviewQueueCursor | null;
}

export interface ProjectReviewHistory {
  readonly requests: readonly ApprovalRequestRecord[];
  readonly decisions: readonly ApprovalDecisionRecord[];
  readonly comments: readonly ProjectCommentRecord[];
  readonly transitions: readonly StateTransitionRecord[];
}

export interface ProjectTransaction {
  findOwnerOrganization(
    tenantId: string,
    organizationId: string
  ): Promise<ProjectOwnerResource | null>;
  findPersonForAccountInTenant(
    tenantId: string,
    accountId: string
  ): Promise<Person | null>;
  findProjectById(tenantId: string, projectId: string): Promise<ProjectDetails | null>;
  findProjectByIdForUpdate(tenantId: string, projectId: string): Promise<ProjectDetails | null>;
  findApprovalRequestByIdForUpdate(
    tenantId: string,
    approvalRequestId: string
  ): Promise<ApprovalRequestRecord | null>;
  listProjectsForScopes(input: {
    readonly tenantId: string;
    readonly scopePaths: readonly string[];
    readonly limit: number;
    readonly cursor: ProjectCursor | null;
    readonly filters: ProjectListFilters;
  }): Promise<ProjectListPage>;
  listProjectOwnerOptionsForScopes(
    tenantId: string,
    scopePaths: readonly string[]
  ): Promise<ProjectOwnerOption[]>;
  insertProject(input: ProjectInsert): Promise<ProjectDetails>;
  updateProject(
    tenantId: string,
    projectId: string,
    expectedVersion: number,
    patch: ProjectPatch
  ): Promise<ProjectDetails | null>;
  updateProjectStatus(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
    readonly fromStatus: ProjectStatus;
    readonly toStatus: ProjectStatus;
  }): Promise<ProjectDetails | null>;
  createApprovalRequest(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly projectId: string;
    readonly submittedProjectVersion: number;
    readonly requestedByAccountId: string;
    readonly requestedAt: Date;
  }): Promise<ApprovalRequestRecord>;
  resolveApprovalRequest(input: {
    readonly tenantId: string;
    readonly approvalRequestId: string;
    readonly status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
    readonly resolvedAt: Date;
  }): Promise<ApprovalRequestRecord | null>;
  appendApprovalDecision(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly approvalRequestId: string;
    readonly reviewerAccountId: string;
    readonly decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
    readonly reason: string | null;
    readonly decidedAt: Date;
  }): Promise<ApprovalDecisionRecord>;
  appendStateTransition(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly projectId: string;
    readonly fromState: ProjectStatus;
    readonly toState: ProjectStatus;
    readonly actorAccountId: string;
    readonly approvalRequestId: string | null;
    readonly reason: string | null;
    readonly occurredAt: Date;
  }): Promise<StateTransitionRecord>;
  appendProjectComment(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly projectId: string;
    readonly approvalRequestId: string;
    readonly authorAccountId: string;
    readonly kind: "GLOBAL" | "FIELD";
    readonly fieldKey: string | null;
    readonly body: string;
    readonly createdAt: Date;
  }): Promise<ProjectCommentRecord>;
  listReviewQueueForScopes(input: {
    readonly tenantId: string;
    readonly scopePaths: readonly string[];
    readonly limit: number;
    readonly cursor: ReviewQueueCursor | null;
    readonly status?: ApprovalRequestRecord["status"];
  }): Promise<ReviewQueuePage>;
  listProjectReviewHistory(tenantId: string, projectId: string): Promise<ProjectReviewHistory>;
  appendAuditEvent(input: AuditEventInput): Promise<void>;
}

export interface ProjectRepository {
  transaction<TResult>(
    handler: (transaction: ProjectTransaction) => Promise<TResult>
  ): Promise<TResult>;
}
