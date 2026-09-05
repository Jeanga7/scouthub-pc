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
  readonly proposedAt: Date;
  readonly validatedAt: Date | null;
  readonly endedAt: Date | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
export interface AppointmentActor {
  readonly accountId: string;
  readonly tenantId: string;
  readonly personId: string | null;
  readonly scopePaths: readonly string[];
  readonly permissions: readonly string[];
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
): boolean {
  return (
    actor.tenantId === scope.tenantId &&
    actor.scopePaths.some((path) => scope.path.startsWith(path))
  );
}
export function canProposeAppointment(
  actor: AppointmentActor,
  position: Position,
  scope: AppointmentScope,
): boolean {
  return (
    coversScope(actor, scope) &&
    actor.permissions.includes("appointment.create") &&
    position.tenantId === scope.tenantId &&
    position.active &&
    position.allowedScopeTypes.includes(scope.type)
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
    actor.permissions.includes("appointment.validate") &&
    coversScope(actor, scope)
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
    actor.permissions.includes("appointment.end") &&
    coversScope(actor, scope)
  );
}
export function isAppointmentActiveAt(
  appointment: Appointment,
  at: Date,
): boolean {
  return (
    appointment.status === "ACTIVE" &&
    appointment.startsAt <= at &&
    (appointment.endsAt === null || appointment.endsAt > at)
  );
}
