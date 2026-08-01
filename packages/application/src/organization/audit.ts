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

export const projectAuditActions = [
  "project.created",
  "project.updated",
  "project.submitted_for_review",
  "project.review_started",
  "project.comment_added",
  "project.changes_requested",
  "project.approved_for_execution",
  "project.rejected"
] as const;

export const evidenceAuditActions = [
  "evidence.upload_initiated",
  "evidence.upload_verified",
  "evidence.upload_rejected",
  "evidence.created",
  "evidence.download_url_issued"
] as const;

export type OrganizationAuditAction = (typeof organizationAuditActions)[number];
export type IdentityAuditAction = (typeof identityAuditActions)[number];
export type ProjectAuditAction = (typeof projectAuditActions)[number];
export type EvidenceAuditAction = (typeof evidenceAuditActions)[number];
export type AuditAction = OrganizationAuditAction | IdentityAuditAction | ProjectAuditAction | EvidenceAuditAction;
export type AuditActorKind = "SYSTEM" | "USER" | "SERVICE";

export interface AuditActor {
  readonly kind: AuditActorKind;
  readonly id: string | null;
}

export interface AuditEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly resourceType: "organization" | "account" | "invitation" | "role_assignment" | "project" | "evidence";
  readonly resourceId: string;
  readonly action: AuditAction;
  readonly actorKind: AuditActorKind;
  readonly actorId: string | null;
  readonly requestId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface RequestContext {
  readonly requestId?: string;
  readonly auditActor?: AuditActor;
}

export function createOrganizationAuditEvent(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly resourceId: string;
  readonly action: AuditAction;
  readonly metadata: Record<string, unknown>;
  readonly requestId?: string;
  readonly auditActor?: AuditActor;
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
  readonly auditActor?: AuditActor;
}): AuditEventInput {
  const actor = input.auditActor ?? { kind: "SYSTEM", id: null };
  return {
    id: input.id,
    tenantId: input.tenantId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    actorKind: actor.kind,
    actorId: actor.id,
    requestId: input.requestId ?? null,
    metadata: input.metadata,
    occurredAt: new Date()
  };
}
