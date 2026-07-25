import {
  assertRootRules,
  buildOrganizationPath,
  isAllowedParentChild,
  isDescendantPath,
  isSlice1CreatableType,
  normalizeOrganizationCode,
  normalizeOrganizationName,
  type Organization,
  type OrganizationType,
  validateActivePeriod
} from "@scouthub/domain";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import {
  createOrganizationAuditEvent,
  type RequestContext
} from "./audit";
import type {
  OrganizationDetailsUpdate,
  OrganizationInsert,
  OrganizationRepository
} from "../ports/organization-repository";

export interface IdGenerator {
  generate(): string;
}

export interface CreateTenantRootInput extends RequestContext {
  readonly name: string;
  readonly code: string;
  readonly locationLabel?: string | null;
  readonly activeFrom?: Date | null;
  readonly activeUntil?: Date | null;
}

export interface CreateOrganizationInput extends RequestContext {
  readonly tenantId: string;
  readonly parentId: string;
  readonly type: OrganizationType;
  readonly name: string;
  readonly code: string;
  readonly locationLabel?: string | null;
  readonly activeFrom?: Date | null;
  readonly activeUntil?: Date | null;
}

export interface UpdateOrganizationInput extends RequestContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly code?: string;
  readonly locationLabel?: string | null;
  readonly activeFrom?: Date | null;
  readonly activeUntil?: Date | null;
}

export interface VersionedOrganizationInput extends RequestContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly expectedVersion: number;
}

export interface MoveOrganizationInput extends VersionedOrganizationInput {
  readonly newParentId: string;
}

export class OrganizationUseCases {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly ids: IdGenerator
  ) {}

  async createTenantRoot(input: CreateTenantRootInput): Promise<Organization> {
    const id = this.ids.generate();
    const name = normalizeOrganizationName(input.name);
    const code = normalizeOrganizationCode(input.code);
    const activeFrom = input.activeFrom ?? null;
    const activeUntil = input.activeUntil ?? null;
    validateActivePeriod(activeFrom, activeUntil);

    const insert: OrganizationInsert = {
      id,
      tenantId: id,
      parentId: null,
      type: "NSO",
      name,
      code,
      status: "DRAFT",
      path: buildOrganizationPath(null, id),
      depth: 0,
      locationLabel: input.locationLabel?.trim() || null,
      activeFrom,
      activeUntil,
      metadata: {}
    };
    assertRootRules(insert);

    return this.repository.transaction(async (transaction) => {
      const existing = await transaction.findById(id, id);
      if (existing !== null) {
        throw new ConflictError("Tenant root already exists.");
      }
      const organization = await transaction.insertOrganization(insert);
      await transaction.appendAuditEvent(
        createOrganizationAuditEvent({
          id: this.ids.generate(),
          tenantId: organization.tenantId,
          resourceId: organization.id,
          action: "organization.created",
          metadata: { type: organization.type, version: organization.version },
          requestId: input.requestId,
          auditActor: input.auditActor
        })
      );
      return organization;
    });
  }

  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    if (input.type === "NSO") {
      throw new ValidationError("Use createTenantRoot to create an NSO root.", "ORG_ROOT_CREATE_FORBIDDEN");
    }
    if (!isSlice1CreatableType(input.type)) {
      throw new ValidationError("TEAM is reserved for a future slice.", "ORG_TYPE_RESERVED");
    }

    const name = normalizeOrganizationName(input.name);
    const code = normalizeOrganizationCode(input.code);
    const activeFrom = input.activeFrom ?? null;
    const activeUntil = input.activeUntil ?? null;
    validateActivePeriod(activeFrom, activeUntil);

    return this.repository.transaction(async (transaction) => {
      const parent = await transaction.findByIdForUpdate(input.tenantId, input.parentId);
      if (parent === null) {
        throw new NotFoundError("Parent organization not found.");
      }
      if (!isAllowedParentChild(parent.type, input.type)) {
        throw new ValidationError("Invalid parent/child organization type.", "ORG_HIERARCHY_INVALID");
      }

      const id = this.ids.generate();
      const insert: OrganizationInsert = {
        id,
        tenantId: input.tenantId,
        parentId: parent.id,
        type: input.type,
        name,
        code,
        status: "DRAFT",
        path: buildOrganizationPath(parent.path, id),
        depth: parent.depth + 1,
        locationLabel: input.locationLabel?.trim() || null,
        activeFrom,
        activeUntil,
        metadata: {}
      };
      assertRootRules(insert);
      const organization = await transaction.insertOrganization(insert);
      await transaction.appendAuditEvent(
        createOrganizationAuditEvent({
          id: this.ids.generate(),
          tenantId: organization.tenantId,
          resourceId: organization.id,
          action: "organization.created",
          metadata: {
            parent_id: organization.parentId,
            type: organization.type,
            version: organization.version
          },
          requestId: input.requestId,
          auditActor: input.auditActor
        })
      );
      return organization;
    });
  }

  async getOrganization(tenantId: string, organizationId: string): Promise<Organization> {
    return this.repository.transaction(async (transaction) => {
      const organization = await transaction.findById(tenantId, organizationId);
      if (organization === null) {
        throw new NotFoundError();
      }
      return organization;
    });
  }

  async listChildren(tenantId: string, parentId: string): Promise<Organization[]> {
    return this.repository.transaction((transaction) =>
      transaction.listChildren(tenantId, parentId)
    );
  }

  async listAncestors(tenantId: string, organizationId: string): Promise<Organization[]> {
    return this.repository.transaction((transaction) =>
      transaction.listAncestors(tenantId, organizationId)
    );
  }

  async listDescendants(tenantId: string, organizationId: string): Promise<Organization[]> {
    return this.repository.transaction((transaction) =>
      transaction.listDescendants(tenantId, organizationId)
    );
  }

  async updateOrganization(input: UpdateOrganizationInput): Promise<Organization> {
    return this.repository.transaction(async (transaction) => {
      const current = await transaction.findByIdForUpdate(
        input.tenantId,
        input.organizationId
      );
      if (current === null) {
        throw new NotFoundError();
      }

      const details = buildPartialUpdate(input);
      validateActivePeriod(
        details.activeFrom === undefined ? current.activeFrom : details.activeFrom,
        details.activeUntil === undefined ? current.activeUntil : details.activeUntil
      );

      const updated = await transaction.updateOrganization(
        input.tenantId,
        input.organizationId,
        input.expectedVersion,
        details
      );
      if (updated === null) {
        throw new ConflictError();
      }

      await transaction.appendAuditEvent(
        createOrganizationAuditEvent({
          id: this.ids.generate(),
          tenantId: updated.tenantId,
          resourceId: updated.id,
          action: "organization.updated",
          metadata: {
            changed_fields: changedFields(current, updated),
            old_version: current.version,
            new_version: updated.version
          },
          requestId: input.requestId,
          auditActor: input.auditActor
        })
      );
      return updated;
    });
  }

  async activateOrganization(input: VersionedOrganizationInput): Promise<Organization> {
    return this.repository.transaction(async (transaction) => {
      const current = await transaction.findByIdForUpdate(
        input.tenantId,
        input.organizationId
      );
      if (current === null) {
        throw new NotFoundError();
      }
      if (current.status !== "DRAFT") {
        throw new ValidationError("Only DRAFT organizations can be activated.", "ORG_STATUS_INVALID");
      }

      const activated = await transaction.activateOrganization(
        input.tenantId,
        input.organizationId,
        input.expectedVersion
      );
      if (activated === null) {
        throw new ConflictError();
      }
      await transaction.appendAuditEvent(
        createOrganizationAuditEvent({
          id: this.ids.generate(),
          tenantId: activated.tenantId,
          resourceId: activated.id,
          action: "organization.activated",
          metadata: {
            old_version: current.version,
            new_version: activated.version
          },
          requestId: input.requestId,
          auditActor: input.auditActor
        })
      );
      return activated;
    });
  }

  async moveOrganization(input: MoveOrganizationInput): Promise<Organization> {
    return this.repository.transaction(async (transaction) => {
      const current = await transaction.findByIdForUpdate(
        input.tenantId,
        input.organizationId
      );
      if (current === null) {
        throw new NotFoundError();
      }
      if (current.type === "NSO") {
        throw new ValidationError("NSO root cannot be moved.", "ORG_ROOT_MOVE_FORBIDDEN");
      }
      if (current.id === input.newParentId) {
        throw new ValidationError("Organization cannot move under itself.", "ORG_MOVE_SELF");
      }

      const parent = await transaction.findByIdForUpdate(input.tenantId, input.newParentId);
      if (parent === null) {
        throw new NotFoundError("New parent organization not found.");
      }
      if (isDescendantPath(parent.path, current.path)) {
        throw new ValidationError("Organization cannot move under its own descendant.", "ORG_MOVE_CYCLE");
      }
      if (!isAllowedParentChild(parent.type, current.type)) {
        throw new ValidationError("Invalid parent/child organization type.", "ORG_HIERARCHY_INVALID");
      }

      const newPath = buildOrganizationPath(parent.path, current.id);
      const moved = await transaction.moveSubtree(input.tenantId, {
        organizationId: current.id,
        expectedVersion: input.expectedVersion,
        newParentId: parent.id,
        oldPath: current.path,
        newPath,
        depthDelta: parent.depth + 1 - current.depth
      });
      if (moved === null) {
        throw new ConflictError();
      }

      await transaction.appendAuditEvent(
        createOrganizationAuditEvent({
          id: this.ids.generate(),
          tenantId: moved.tenantId,
          resourceId: moved.id,
          action: "organization.moved",
          metadata: {
            old_parent_id: current.parentId,
            new_parent_id: parent.id,
            old_version: current.version,
            new_version: moved.version
          },
          requestId: input.requestId,
          auditActor: input.auditActor
        })
      );
      return moved;
    });
  }
}

function changedFields(before: Organization, after: Organization): string[] {
  const changed: string[] = [];
  if (before.name !== after.name) {
    changed.push("name");
  }
  if (before.code !== after.code) {
    changed.push("code");
  }
  if (before.locationLabel !== after.locationLabel) {
    changed.push("locationLabel");
  }
  if (dateKey(before.activeFrom) !== dateKey(after.activeFrom)) {
    changed.push("activeFrom");
  }
  if (dateKey(before.activeUntil) !== dateKey(after.activeUntil)) {
    changed.push("activeUntil");
  }

  return changed;
}

function buildPartialUpdate(
  input: UpdateOrganizationInput
): OrganizationDetailsUpdate {
  const details: Mutable<OrganizationDetailsUpdate> = {};
  if (input.name !== undefined) {
    details.name = normalizeOrganizationName(input.name);
  }
  if (input.code !== undefined) {
    details.code = normalizeOrganizationCode(input.code);
  }
  if ("locationLabel" in input) {
    details.locationLabel = input.locationLabel?.trim() || null;
  }
  if ("activeFrom" in input) {
    details.activeFrom = input.activeFrom ?? null;
  }
  if ("activeUntil" in input) {
    details.activeUntil = input.activeUntil ?? null;
  }

  if (
    details.name === undefined &&
    details.code === undefined &&
    details.locationLabel === undefined &&
    details.activeFrom === undefined &&
    details.activeUntil === undefined
  ) {
    throw new ValidationError(
      "At least one mutable organization field is required.",
      "ORG_UPDATE_EMPTY"
    );
  }

  return details;
}

type Mutable<T> = {
  -readonly [K in keyof T]?: T[K];
};

function dateKey(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
