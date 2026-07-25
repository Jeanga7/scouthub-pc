export const organizationAuditActions = [
  "organization.created",
  "organization.updated",
  "organization.moved",
  "organization.activated"
] as const;

export const identityAuditActions = [
  "identity.invitation_requested",
  "identity.invitation_sent",
  "identity.invitation_failed",
  "identity.invitation_revoked",
  "identity.invitation_accepted",
  "identity.account_provisioned",
  "identity.account_suspended",
  "identity.role_assigned",
  "identity.role_revoked",
  "identity.login_denied_suspended"
] as const;

export type OrganizationAuditAction = (typeof organizationAuditActions)[number];
export type IdentityAuditAction = (typeof identityAuditActions)[number];
export type AuditAction = OrganizationAuditAction | IdentityAuditAction;

export interface AuditEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly resourceType: "organization" | "account" | "invitation" | "role_assignment";
  readonly resourceId: string;
  readonly action: AuditAction;
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
  readonly action: AuditAction;
  readonly metadata: Record<string, unknown>;
  readonly requestId?: string;
}): AuditEventInput {
  return createAuditEvent({
    ...input,
    resourceType: "organization"
  });
}

export function createAuditEvent(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly resourceType: AuditEventInput["resourceType"];
  readonly resourceId: string;
  readonly action: AuditAction;
  readonly metadata: Record<string, unknown>;
  readonly requestId?: string;
}): AuditEventInput {
  return {
    id: input.id,
    tenantId: input.tenantId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    actorKind: "SYSTEM",
    actorId: null,
    requestId: input.requestId ?? null,
    metadata: input.metadata,
    occurredAt: new Date()
  };
}
