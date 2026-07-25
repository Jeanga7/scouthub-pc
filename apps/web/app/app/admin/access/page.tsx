import { AppShell } from "@scouthub/ui";
import { requireActor } from "@/identity/http";
import { requestId } from "@/organizations/http";
import { AccessConsole } from "./access-console";

export const dynamic = "force-dynamic";

export default async function AccessAdminPage() {
  const request = new Request("http://localhost/app/admin/access");
  const actor = await requireActor(request, requestId(request));
  const scope = actor.assignments.find(
    (assignment) =>
      assignment.permissions.includes("invitation.create") &&
      assignment.scopeOrgId !== null
  );

  return (
    <AppShell>
      <main className="page wide">
        {scope === undefined || scope.scopeOrgId === null ? (
          <section className="panel">
            <p className="eyebrow">Forbidden</p>
            <h1>Acces refuse</h1>
          </section>
        ) : (
          <AccessConsole tenantId={scope.tenantId} scopeOrgId={scope.scopeOrgId} />
        )}
      </main>
    </AppShell>
  );
}

