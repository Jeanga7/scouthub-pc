import { ApplicationError, type ActorContext } from "@scouthub/application";
import {
  appointmentResponseSchema,
  positionResponseSchema,
} from "@scouthub/contracts";
import {
  canEndAppointment,
  canProposeAppointment,
  canValidateAppointment,
  isRoleAssignmentActive,
  type Appointment,
  type AppointmentActor,
  type AppointmentScope,
  type Position,
} from "@scouthub/domain";

export function mapPosition(value: Position) {
  return positionResponseSchema.parse({
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  });
}
export function mapAppointment(value: Appointment) {
  return appointmentResponseSchema.parse({
    ...value,
    startsAt: value.startsAt.toISOString(),
    endsAt: value.endsAt?.toISOString() ?? null,
    proposedAt: value.proposedAt.toISOString(),
    validatedAt: value.validatedAt?.toISOString() ?? null,
    endedAt: value.endedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  });
}

export function assertTenantPermission(
  actor: ActorContext,
  tenantId: string,
  permission: string,
): void {
  if (
    !actor.assignments.some(
      (assignment) =>
        assignment.tenantId === tenantId &&
        assignment.permissions.includes(permission as never) &&
        isRoleAssignmentActive(assignment, new Date()),
    )
  )
    throw new ApplicationError("Permission denied.", "AUTHZ_DENIED", 403);
}
export function appointmentActor(
  actor: ActorContext,
  tenantId: string,
  permission: string,
): AppointmentActor {
  const assignments = actor.assignments.filter(
    (item) =>
      item.tenantId === tenantId &&
      item.permissions.includes(permission as never) &&
      item.scopePath !== null &&
      isRoleAssignmentActive(item, new Date()),
  );
  return {
    accountId: actor.account.id,
    tenantId,
    personId: actor.person?.tenantId === tenantId ? actor.person.id : null,
    scopePaths: assignments.map((item) => item.scopePath as string),
    permissions: assignments.flatMap((item) => item.permissions),
  };
}
export function assertCanPropose(
  actor: ActorContext,
  position: Position,
  scope: AppointmentScope,
) {
  if (
    !canProposeAppointment(
      appointmentActor(actor, scope.tenantId, "appointment.create"),
      position,
      scope,
    )
  )
    throw new ApplicationError("Permission denied.", "AUTHZ_DENIED", 403);
}
export function assertCanValidate(
  actor: ActorContext,
  appointment: Appointment,
  scope: AppointmentScope,
) {
  if (
    !canValidateAppointment(
      appointmentActor(actor, appointment.tenantId, "appointment.validate"),
      appointment,
      appointment.personId,
      scope,
    )
  )
    throw new ApplicationError("Permission denied.", "AUTHZ_DENIED", 403);
}
export function assertCanEnd(
  actor: ActorContext,
  appointment: Appointment,
  scope: AppointmentScope,
) {
  if (
    !canEndAppointment(
      appointmentActor(actor, appointment.tenantId, "appointment.end"),
      appointment,
      scope,
    )
  )
    throw new ApplicationError("Permission denied.", "AUTHZ_DENIED", 403);
}
export function canReadScope(
  actor: ActorContext,
  scope: AppointmentScope,
): boolean {
  const current = appointmentActor(actor, scope.tenantId, "appointment.read");
  return (
    current.permissions.includes("appointment.read") &&
    current.scopePaths.some((path) => scope.path.startsWith(path))
  );
}
