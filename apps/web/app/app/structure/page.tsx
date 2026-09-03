import type { OrganizationResponse } from "@scouthub/contracts";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { AppShell, Breadcrumb, EmptyState, OrganizationCard, PageHeader } from "@scouthub/ui";
import { headers } from "next/headers";
import { requireActor } from "@/identity/http";
import { mapOrganization, requestId } from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";
import { StructureActions } from "./structure-actions";

export const dynamic = "force-dynamic";

export default async function StructurePage() {
  const incoming = await headers();
  const request = new Request("http://localhost/app/structure", { headers: { cookie: incoming.get("cookie") ?? "" } });
  const actor = await requireActor(request, requestId(request));
  const assignment = actor.assignments.find((item) => item.scopeOrgId !== null && item.permissions.includes("organization.read") && isRoleAssignmentActive(item, new Date()));
  const tenantId = assignment?.tenantId ?? "";
  const scopeId = assignment?.scopeOrgId ?? "";
  let organizations: OrganizationResponse[] = [];
  if (tenantId && scopeId) {
    try {
      const useCases = createOrganizationUseCases();
      const root = await useCases.getOrganization(tenantId, scopeId);
      organizations = [root, ...(await useCases.listDescendants(tenantId, scopeId))].map(mapOrganization);
    } catch {
      organizations = [];
    }
  }
  const root = organizations[0];
  const children = root ? organizations.filter((item) => item.parentId === root.id) : [];
  return <AppShell><main className="page wide structure-page">
    <Breadcrumb items={[{ label: "Aujourd’hui", href: "/app" }, { label: "Structure" }]} />
    <PageHeader eyebrow="Pilotage régional" title={root?.name ?? "Structure"} description="Explorez votre périmètre et ses structures descendantes." actions={actor.assignments.some((item) => item.permissions.includes("organization.create") && isRoleAssignmentActive(item, new Date())) ? <StructureActions organizations={organizations} tenantId={tenantId} /> : null} />
    {root ? <><section className="structure-context sh-card"><span className="eyebrow">Périmètre actif</span><strong>{root.name}</strong><span>{root.type} · {organizations.length} structures visibles</span></section><section className="structure-section"><h2>Structures rattachées</h2>{children.length ? <div className="structure-grid">{children.map((item) => <OrganizationCard key={item.id} name={item.name} type={item.type} status={item.status} href={`/app/structure/${item.id}`} detail={organizations.filter((child) => child.parentId === item.id).length + " enfant(s)"} />)}</div> : <EmptyState title="Aucune structure enfant" description="Créez une structure depuis votre périmètre autorisé." />}</section><section className="structure-section"><h2>Vue hiérarchique</h2><div className="structure-tree sh-card">{organizations.map((item) => <a key={item.id} href={`/app/structure/${item.id}`} style={{ paddingLeft: `${item.depth * 20}px` }}><span>{item.type}</span><strong>{item.name}</strong><small>{item.code}</small></a>)}</div></section></> : <EmptyState title="Structure indisponible" description="Aucun périmètre organisationnel accessible pour ce compte." />}
  </main></AppShell>;
}
