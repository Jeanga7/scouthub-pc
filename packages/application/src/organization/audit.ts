export const organizationAuditActions = [
  "organization.created",
  "organization.updated",
  "organization.moved",
  "organization.activated"
] as const;

export type OrganizationAuditAction = (typeof organizationAuditActions)[number];

export interface AuditEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly resourceType: "organization";
  readonly resourceId: string;
  readonly action: OrganizationAuditAction;
  readonly actorKind: "SYSTEM";
  readonly actorId: string | null;
  readonly requestId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface RequestContext {
  readonly requestId?: string;
}

export function createOrganizationAuditEvent(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly resourceId: string;
  readonly action: OrganizationAuditAction;
  readonly metadata: Record<string, unknown>;
  readonly requestId?: string;
}): AuditEventInput {
  return {
    id: input.id,
    tenantId: input.tenantId,
    resourceType: "organization",
    resourceId: input.resourceId,
    action: input.action,
    actorKind: "SYSTEM",
    actorId: null,
    requestId: input.requestId ?? null,
    metadata: input.metadata,
    occurredAt: new Date()
  };
}
