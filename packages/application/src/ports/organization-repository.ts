import type { Organization } from "@scouthub/domain";
import type { AuditEventInput } from "../organization/audit";

export interface OrganizationInsert {
  readonly id: string;
  readonly tenantId: string;
  readonly parentId: string | null;
  readonly type: Organization["type"];
  readonly name: string;
  readonly code: string;
  readonly status: Organization["status"];
  readonly path: string;
  readonly depth: number;
  readonly locationLabel: string | null;
  readonly activeFrom: Date | null;
  readonly activeUntil: Date | null;
  readonly metadata: Organization["metadata"];
}

export interface OrganizationDetailsUpdate {
  readonly name: string;
  readonly code: string;
  readonly locationLabel: string | null;
  readonly activeFrom: Date | null;
  readonly activeUntil: Date | null;
}

export interface MoveSubtreeInput {
  readonly organizationId: string;
  readonly expectedVersion: number;
  readonly newParentId: string;
  readonly oldPath: string;
  readonly newPath: string;
  readonly depthDelta: number;
}

export interface OrganizationTransaction {
  findById(tenantId: string, organizationId: string): Promise<Organization | null>;
  findByCode(tenantId: string, code: string): Promise<Organization | null>;
  findByIdForUpdate(
    tenantId: string,
    organizationId: string
  ): Promise<Organization | null>;
  listChildren(tenantId: string, parentId: string): Promise<Organization[]>;
  listAncestors(tenantId: string, organizationId: string): Promise<Organization[]>;
  listDescendants(tenantId: string, organizationId: string): Promise<Organization[]>;
  insertOrganization(input: OrganizationInsert): Promise<Organization>;
  updateOrganization(
    tenantId: string,
    organizationId: string,
    expectedVersion: number,
    input: OrganizationDetailsUpdate
  ): Promise<Organization | null>;
  activateOrganization(
    tenantId: string,
    organizationId: string,
    expectedVersion: number
  ): Promise<Organization | null>;
  moveSubtree(tenantId: string, input: MoveSubtreeInput): Promise<Organization | null>;
  appendAuditEvent(input: AuditEventInput): Promise<void>;
}

export interface OrganizationRepository {
  transaction<TResult>(
    handler: (transaction: OrganizationTransaction) => Promise<TResult>
  ): Promise<TResult>;
}
