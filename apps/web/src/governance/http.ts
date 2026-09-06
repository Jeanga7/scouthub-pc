import { ApplicationError, type ActorContext } from "@scouthub/application";
import {
  appointmentResponseSchema,
  governancePersonOptionSchema,
  positionResponseSchema,
} from "@scouthub/contracts";
import {
  canEndAppointment,
  canDirectlyActivateAppointment,
  canProposeAppointment,
  canValidateAppointment,
  isRoleAssignmentActive,
  type Appointment,
  type AppointmentActor,
  type AppointmentScope,
  type Person,
  type Position,
} from "@scouthub/domain";

function organizationScopeType(
  scopeType: string,
): AppointmentActor["grants"][number]["scopeType"] | null {
  if (
    scopeType === "UNIT" ||
    scopeType === "GROUP" ||
    scopeType === "DISTRICT" ||
    scopeType === "REGION"
  )
    return scopeType;
  return null;
}

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
    rejectedAt: value.rejectedAt?.toISOString() ?? null,
    endedAt: value.endedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  });
}
export function mapGovernancePersonOption(
  value: Pick<Person, "id" | "tenantId" | "displayName">,
) {
  return governancePersonOptionSchema.parse(value);
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
    grants: assignments.flatMap((item) => {
      const scopeType = organizationScopeType(item.scopeType);
      if (scopeType === null) return [];
      return [
        {
          scopePath: item.scopePath as string,
          scopeType,
          permissions: item.permissions,
        },
      ];
    }),
  };
}
export function canDirectlyActivateForActor(
  actor: ActorContext,
  position: Position,
  scope: AppointmentScope,
  proposedPersonId: string,
): boolean {
  return canDirectlyActivateAppointment(
    appointmentActor(actor, scope.tenantId, "appointment.create"),
    position,
    scope,
    proposedPersonId,
  );
}
export function canSearchGovernancePeople(
  actor: ActorContext,
  tenantId: string,
): boolean {
  return (
    appointmentActor(actor, tenantId, "appointment.create").grants.length > 0
  );
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
  return current.grants.some(
    (grant) =>
      grant.permissions.includes("appointment.read") &&
      scope.path.startsWith(grant.scopePath),
  );
}
