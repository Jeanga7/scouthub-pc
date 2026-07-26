import type {
  OrganizationType,
  Project,
  ProjectMode,
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

export interface ProjectTransaction {
  findOwnerOrganization(
    tenantId: string,
    organizationId: string
  ): Promise<ProjectOwnerResource | null>;
  findProjectById(tenantId: string, projectId: string): Promise<ProjectDetails | null>;
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
  appendAuditEvent(input: AuditEventInput): Promise<void>;
}

export interface ProjectRepository {
  transaction<TResult>(
    handler: (transaction: ProjectTransaction) => Promise<TResult>
  ): Promise<TResult>;
}

