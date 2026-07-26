import type { Organization } from "../organization/organization";
import type { ProjectMode } from "./project-mode";
import type { ProjectStatus } from "./project-status";
import type { ProjectVisibility } from "./project-visibility";
import { ProjectDomainError } from "./project-errors";

export interface Project {
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
  readonly status: ProjectStatus;
  readonly visibility: ProjectVisibility;
  readonly locationLabel: string | null;
  readonly plannedStartAt: Date | null;
  readonly plannedEndAt: Date | null;
  readonly actualStartAt: Date | null;
  readonly actualEndAt: Date | null;
  readonly projectLeadPersonId: string;
  readonly createdByAccountId: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function normalizeProjectTitle(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ProjectDomainError("Project title is required.", "PROJECT_TITLE_REQUIRED");
  }
  if (normalized.length > 180) {
    throw new ProjectDomainError("Project title is too long.", "PROJECT_TITLE_TOO_LONG");
  }
  return normalized;
}

export function normalizeOptionalProjectText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function assertSlice3OwnerOrganization(organization: Pick<Organization, "type" | "status">): void {
  if (organization.status !== "ACTIVE") {
    throw new ProjectDomainError("Project owner organization must be active.", "PROJECT_OWNER_INACTIVE");
  }
  if (organization.type !== "GROUP" && organization.type !== "UNIT") {
    throw new ProjectDomainError("Project owner must be a group or unit.", "PROJECT_OWNER_TYPE_INVALID");
  }
}

export function validateProjectDateRange(
  start: Date | null,
  end: Date | null,
  code: string
): void {
  if (start !== null && end !== null && end < start) {
    throw new ProjectDomainError("Project date range is invalid.", code);
  }
}

export function buildInternalProjectSlug(title: string, suffix: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return `${base || "project"}-${suffix.toLowerCase()}`;
}

export function buildProjectCode(suffix: string): string {
  return `PRJ-${suffix.toUpperCase()}`;
}

