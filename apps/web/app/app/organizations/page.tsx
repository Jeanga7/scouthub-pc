import { isDevAdminEnabled } from "@scouthub/config";
import { AppShell } from "@scouthub/ui";
import { getServerEnv } from "@/env/server";
import { mapOrganization } from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";
import { OrganizationsConsole } from "./organizations-console";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage({
  searchParams
}: {
  readonly searchParams: Promise<{ tenantId?: string }>;
}) {
  const env = getServerEnv();
  if (!isDevAdminEnabled(env)) {
    return (
      <AppShell>
        <main className="page">
          <section className="panel">
            <p className="eyebrow">Espace prive</p>
            <h1>Organizations</h1>
            <p>
              Administration locale des organisations indisponible hors
              environnement local/test avec dev-admin explicite.
            </p>
          </section>
        </main>
      </AppShell>
    );
  }

  const params = await searchParams;
  const tenantId = params.tenantId ?? "";
  const organizations =
    tenantId.length === 0
      ? []
      : await createOrganizationUseCases()
          .then((useCases) => useCases.listDescendants(tenantId, tenantId))
          .then((items) => items.map(mapOrganization))
          .catch(() => []);

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
