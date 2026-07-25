import { organizationInvariant } from "./organization-errors";
import type { OrganizationStatus } from "./organization-status";
import type { OrganizationType } from "./organization-type";

export interface Organization {
  readonly id: string;
  readonly tenantId: string;
  readonly parentId: string | null;
  readonly type: OrganizationType;
  readonly name: string;
  readonly code: string;
  readonly status: OrganizationStatus;
  readonly path: string;
  readonly depth: number;
  readonly locationLabel: string | null;
  readonly activeFrom: Date | null;
  readonly activeUntil: Date | null;
  readonly metadata: OrganizationMetadata;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type OrganizationMetadata = Record<string, never>;

export function normalizeOrganizationName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0) {
    organizationInvariant("Organization name cannot be empty.", "ORG_NAME_EMPTY");
  }

  return normalized;
}

export function normalizeOrganizationCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized.length === 0) {
    organizationInvariant("Organization code cannot be empty.", "ORG_CODE_EMPTY");
  }

  return normalized;
}

export function validateActivePeriod(
  activeFrom: Date | null,
  activeUntil: Date | null
): void {
  if (activeFrom !== null && activeUntil !== null && activeUntil < activeFrom) {
    organizationInvariant(
      "activeUntil must be greater than or equal to activeFrom.",
      "ORG_ACTIVE_PERIOD_INVALID"
    );
  }
}

export function assertRootRules(organization: Pick<Organization, "id" | "tenantId" | "parentId" | "type" | "depth" | "path">): void {
  if (organization.type === "NSO") {
    if (organization.id !== organization.tenantId) {
      organizationInvariant("NSO root id must equal tenantId.", "ORG_ROOT_TENANT_MISMATCH");
    }
    if (organization.parentId !== null) {
      organizationInvariant("NSO root cannot have a parent.", "ORG_ROOT_HAS_PARENT");
    }
    if (organization.depth !== 0) {
      organizationInvariant("NSO root depth must be zero.", "ORG_ROOT_DEPTH_INVALID");
    }
    if (organization.path !== `/${organization.id}/`) {
      organizationInvariant("NSO root path is invalid.", "ORG_ROOT_PATH_INVALID");
    }
    return;
  }

  if (organization.parentId === null) {
    organizationInvariant("Non-root organizations require a parent.", "ORG_PARENT_REQUIRED");
  }
  if (organization.id === organization.parentId) {
    organizationInvariant("Organization cannot be its own parent.", "ORG_SELF_PARENT");
  }
}
