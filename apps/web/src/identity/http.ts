import {
  isRoleAssignmentActive,
  type AccountInvitation,
  type RoleAssignment
} from "@scouthub/domain";
import type { ActorContext } from "@scouthub/application";
import type { AccountAdministrationView } from "@scouthub/application";
import {
  accountAdministrationResponseSchema,
  invitationResponseSchema,
  meResponseSchema,
  roleAssignmentResponseSchema
} from "@scouthub/contracts";
import { createIdentityUseCases } from "./service";

export async function requireActor(request: Request, requestId: string): Promise<ActorContext> {
  return createIdentityUseCases().ensureAuthenticatedActor({ request, requestId });
}

export function identityJson(data: unknown, request_id: string, init?: ResponseInit): Response {
  return Response.json(
    { data, request_id },
    {
      ...init,
      headers: {
        "cache-control": "no-store",
        ...init?.headers
      }
    }
  );
}

export function mapMe(actor: ActorContext) {
  const activeAssignments = actor.assignments.filter((assignment) =>
    isRoleAssignmentActive(assignment, new Date())
  );
  return meResponseSchema.parse({
    account: {
      id: actor.account.id,
      primaryEmail: actor.account.primaryEmail,
      status: actor.account.status
    },
    person:
      actor.person === null
        ? null
        : {
            id: actor.person.id,
            tenantId: actor.person.tenantId,
            displayName: actor.person.displayName,
            classification: actor.person.classification
          },
    roleAssignments: activeAssignments.map(mapRoleAssignment),
    scopes: activeAssignments.map((assignment) => ({
      tenantId: assignment.tenantId,
      scopeOrgId: assignment.scopeOrgId,
      scopeType: assignment.scopeType
    }))
  });
}

export function mapInvitation(invitation: AccountInvitation) {
  return invitationResponseSchema.parse({
    id: invitation.id,
    tenantId: invitation.tenantId,
    email: invitation.email,
    intendedRoleCode: invitation.intendedRoleCode,
    intendedScopeOrgId: invitation.intendedScopeOrgId,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString()
  });
}

export function mapRoleAssignment(assignment: RoleAssignment) {
  return roleAssignmentResponseSchema.parse({
    id: assignment.id,
    tenantId: assignment.tenantId,
    accountId: assignment.accountId,
    roleCode: assignment.roleCode,
    permissions: assignment.permissions,
    scopeType: assignment.scopeType,
    scopeOrgId: assignment.scopeOrgId,
    startsAt: assignment.startsAt.toISOString(),
    endsAt: assignment.endsAt?.toISOString() ?? null,
    revokedAt: assignment.revokedAt?.toISOString() ?? null
  });
}

export function mapAccountAdministration(view: AccountAdministrationView) {
  const activeAssignments = view.assignments.filter((assignment) =>
    isRoleAssignmentActive(assignment, new Date())
  );
  return accountAdministrationResponseSchema.parse({
    account: {
      id: view.account.id,
      primaryEmail: view.account.primaryEmail,
      status: view.account.status
    },
    person:
      view.person === null
        ? null
        : {
            id: view.person.id,
            tenantId: view.person.tenantId,
            displayName: view.person.displayName,
            classification: view.person.classification
          },
    activeRoleAssignments: activeAssignments.map(mapRoleAssignment)
  });
}
