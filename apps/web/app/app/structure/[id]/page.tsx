import Link from "next/link";
import { headers } from "next/headers";
import { AppShell, Breadcrumb, EmptyState, OrganizationCard, PageHeader, StatusBadge } from "@scouthub/ui";
import type { OrganizationResponse } from "@scouthub/contracts";
import { requireActor } from "@/identity/http";
import { mapOrganization, requestId } from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";

export const dynamic = "force-dynamic";

type StructureData = {
  readonly organization: OrganizationResponse;
  readonly children: OrganizationResponse[];
  readonly ancestors: OrganizationResponse[];
};

export default async function StructureDetailPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incoming = await headers();
  const request = new Request(`http://localhost/app/structure/${id}`, { headers: { cookie: incoming.get("cookie") ?? "" } });
  const actor = await requireActor(request, requestId(request));
  const assignment = actor.assignments.find((item) => item.scopeOrgId !== null && item.permissions.includes("organization.read"));

  if (!assignment?.scopeOrgId) return <AccessDenied />;
  const data = await loadStructure(assignment.tenantId, id);
  if (!data) return <NotFound />;

  const { organization, children, ancestors } = data;
  return (
    <AppShell>
      <main className="page wide structure-page">
        <Breadcrumb items={[{ label: "Structure", href: "/app/structure" }, ...ancestors.map((item) => ({ label: item.name, href: `/app/structure/${item.id}` })), { label: organization.name }]} />
        <PageHeader eyebrow={organization.type} title={organization.name} description={organization.locationLabel ?? "Structure ScoutHub-PC"} />
        <section className="structure-detail-grid">
          <div className="sh-card structure-facts">
            <span>Code</span><strong>{organization.code}</strong>
            <span>Statut</span><StatusBadge status={organization.status} />
            <span>Parent</span>
            <Link href={(organization.parentId ? `/app/structure/${organization.parentId}` : "/app/structure") as never}>{ancestors.at(-1)?.name ?? "Région"}</Link>
          </div>
          <section>
            <h2>Enfants</h2>
            {children.length ? <div className="structure-grid">{children.map((item) => <OrganizationCard key={item.id} name={item.name} type={item.type} status={item.status} href={`/app/structure/${item.id}`} />)}</div> : <EmptyState title="Aucun enfant" description="Cette structure n’a pas encore de structure rattachée." />}
          </section>
        </section>
      </main>
    </AppShell>
  );
}

async function loadStructure(tenantId: string, id: string): Promise<StructureData | null> {
  try {
    const useCases = createOrganizationUseCases();
    return {
      organization: mapOrganization(await useCases.getOrganization(tenantId, id)),
      children: (await useCases.listChildren(tenantId, id)).map(mapOrganization),
      ancestors: (await useCases.listAncestors(tenantId, id)).map(mapOrganization)
    };
  } catch {
    return null;
  }
}

function AccessDenied() {
  return <AppShell><main className="page"><EmptyState title="Accès refusé" description="Cette structure n’est pas accessible avec votre périmètre." /></main></AppShell>;
}

function NotFound() {
  return <AppShell><main className="page"><EmptyState title="Structure introuvable" description="La structure demandée n’existe pas dans votre périmètre." /></main></AppShell>;
}
