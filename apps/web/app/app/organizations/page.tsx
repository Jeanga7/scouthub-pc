import type { OrganizationResponse } from "@scouthub/contracts";
import { AppShell } from "@scouthub/ui";
import { requireActor } from "@/identity/http";
import { mapOrganization } from "@/organizations/http";
import { requestId } from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";
import { OrganizationsConsole } from "./organizations-console";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage({
  searchParams: _searchParams
}: {
  readonly searchParams: Promise<{ tenantId?: string }>;
}) {
  void _searchParams;
  const request = new Request("http://localhost/app/organizations");
  const actor = await requireActor(request, requestId(request));
  const scope = actor.assignments.find((assignment) => assignment.scopeOrgId !== null);
  const tenantId = scope?.tenantId ?? "";
  let organizations: OrganizationResponse[] = [];
  if (tenantId.length > 0 && scope?.scopeOrgId !== null && scope?.scopeOrgId !== undefined) {
    try {
      const useCases = createOrganizationUseCases();
      const root = await useCases.getOrganization(tenantId, scope.scopeOrgId);
      const items = await useCases.listDescendants(tenantId, scope.scopeOrgId);
      organizations = [root, ...items].map(mapOrganization);
    } catch {
      organizations = [];
    }
  }

  return (
    <AppShell>
      <main className="page wide">
        <OrganizationsConsole
          initialTenantId={tenantId}
          initialOrganizations={organizations}
        />
      </main>
    </AppShell>
  );
}
