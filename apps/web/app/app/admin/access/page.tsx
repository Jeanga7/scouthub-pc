import { isRoleAssignmentActive } from "@scouthub/domain";
import { AppShell } from "@scouthub/ui";
import {
  mapAccountAdministration,
  mapInvitation,
  mapRoleAssignment,
  requireActor
} from "@/identity/http";
import { createIdentityUseCases } from "@/identity/service";
import { requestId } from "@/organizations/http";
import { AccessConsole } from "./access-console";

export const dynamic = "force-dynamic";

export default async function AccessAdminPage() {
  const request = new Request("http://localhost/app/admin/access");
  const actor = await requireActor(request, requestId(request));
  const now = new Date();
  const scope = actor.assignments.find(
    (assignment) =>
      assignment.permissions.includes("invitation.create") &&
      isRoleAssignmentActive(assignment, now) &&
      assignment.scopeOrgId !== null
  );
  const useCases = createIdentityUseCases();
  const invitations = scope === undefined
    ? []
    : (await useCases.listInvitations(actor, scope.tenantId)).map(mapInvitation);
  const roleAssignments = scope === undefined
    ? []
    : (await useCases.listRoleAssignments(actor, scope.tenantId)).map(mapRoleAssignment);
  const accounts = scope === undefined
    ? []
    : (await useCases.listAccounts(actor, scope.tenantId)).map(mapAccountAdministration);

  return (
    <AppShell>
      <main className="page wide">
        {scope === undefined || scope.scopeOrgId === null ? (
          <section className="panel">
            <p className="eyebrow">Forbidden</p>
            <h1>Acces refuse</h1>
          </section>
        ) : (
          <AccessConsole
            tenantId={scope.tenantId}
            scopeOrgId={scope.scopeOrgId}
            initialInvitations={invitations}
            initialRoleAssignments={roleAssignments}
            initialAccounts={accounts}
          />
        )}
      </main>
    </AppShell>
  );
}
