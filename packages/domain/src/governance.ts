import type { OrganizationType } from "./organization/organization-type";

export const appointmentStatuses = [
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "ENDED",
] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];
export type HolderPolicy = "SINGLE" | "MULTIPLE";
export interface Position {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly allowedScopeTypes: readonly OrganizationType[];
  readonly sector: string | null;
  readonly branch: string | null;
  readonly holderPolicy: HolderPolicy;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
export interface Appointment {
  readonly id: string;
  readonly tenantId: string;
  readonly personId: string;
  readonly positionId: string;
  readonly scopeOrgId: string;
  readonly status: AppointmentStatus;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly proposedBy: string;
  readonly validatedBy: string | null;
  readonly rejectedBy: string | null;
  readonly endedBy: string | null;
  readonly proposedAt: Date;
  readonly validatedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly endedAt: Date | null;
  readonly rejectionReason: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
export interface AppointmentGrant {
  readonly scopePath: string;
  readonly scopeType: OrganizationType;
  readonly permissions: readonly string[];
}
export interface AppointmentActor {
  readonly accountId: string;
  readonly tenantId: string;
  readonly personId: string | null;
  readonly grants: readonly AppointmentGrant[];
}
export interface AppointmentScope {
  readonly id: string;
  readonly tenantId: string;
  readonly type: OrganizationType;
  readonly path: string;
}

function coversScope(
  actor: AppointmentActor,
  scope: AppointmentScope,
  permission: string,
): boolean {
  return (
    actor.tenantId === scope.tenantId &&
    actor.grants.some(
      (grant) =>
        grant.permissions.includes(permission) &&
        scope.path.startsWith(grant.scopePath),
    )
  );
}
export function canProposeAppointment(
  actor: AppointmentActor,
  position: Position,
  scope: AppointmentScope,
): boolean {
  return (
    coversScope(actor, scope, "appointment.create") &&
    position.tenantId === scope.tenantId &&
    position.active &&
    position.allowedScopeTypes.includes(scope.type)
  );
}
/** Final local authority may activate subordinate unit/annex appointments directly. */
export function canDirectlyActivateAppointment(
  actor: AppointmentActor,
  position: Position,
  scope: AppointmentScope,
  proposedPersonId: string,
): boolean {
  return (
    actor.personId !== null &&
    proposedPersonId !== actor.personId &&
    canProposeAppointment(actor, position, scope) &&
    actor.grants.some(
      (grant) =>
        grant.permissions.includes("appointment.create") &&
        grant.scopeType === "GROUP" &&
        scope.path.startsWith(grant.scopePath),
    ) &&
    (scope.type === "UNIT" || scope.type === "ANNEX")
  );
}
export function canValidateAppointment(
  actor: AppointmentActor,
  appointment: Appointment,
  proposedPersonId: string | null,
  scope: AppointmentScope,
): boolean {
  return (
    appointment.tenantId === actor.tenantId &&
    appointment.scopeOrgId === scope.id &&
    appointment.status === "PENDING" &&
    appointment.proposedBy !== actor.accountId &&
    proposedPersonId !== actor.personId &&
    coversScope(actor, scope, "appointment.validate")
  );
}
export function canEndAppointment(
  actor: AppointmentActor,
  appointment: Appointment,
  scope: AppointmentScope,
): boolean {
  return (
    appointment.tenantId === actor.tenantId &&
    appointment.scopeOrgId === scope.id &&
    appointment.status === "ACTIVE" &&
    coversScope(actor, scope, "appointment.end")
  );
}
export function isAppointmentCurrentlyActive(
  appointment: Appointment,
  at = new Date(),
): boolean {
  return (
    appointment.status === "ACTIVE" &&
    appointment.startsAt <= at &&
    (appointment.endsAt === null || appointment.endsAt > at)
  );
}

export function isAppointmentEffectiveAt(
  appointment: Appointment,
  at: Date,
): boolean {
  return (
    (appointment.status === "ACTIVE" || appointment.status === "ENDED") &&
    appointment.validatedAt !== null &&
    appointment.startsAt <= at &&
    (appointment.endsAt === null || appointment.endsAt > at)
  );
}

/** @deprecated Use isAppointmentCurrentlyActive for current state checks. */
export const isAppointmentActiveAt = isAppointmentCurrentlyActive;
