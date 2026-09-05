import Link from "next/link";
import { headers } from "next/headers";
import { AppShell, Card, EmptyState, PageHeader, StatusBadge } from "@scouthub/ui";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { requestId } from "@/organizations/http";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const incoming = await headers();
  const actor = await requireActor(new Request("http://localhost/app/governance", { headers: { cookie: incoming.get("cookie") ?? "" } }), requestId(new Request("http://localhost")));
  const assignments = actor.assignments.filter((item) => isRoleAssignmentActive(item, new Date()));
  return <AppShell><main className="page wide"><PageHeader eyebrow="Administration" title="Fonctions & nominations" description="Les fonctions actives et les nominations sont gouvernées par périmètre." actions={actor.assignments.some((item) => item.permissions.includes("role.read")) ? <Link className="button-link" href="/app/governance/positions">Catalogue des fonctions</Link> : null} /><section className="structure-grid">{assignments.length ? assignments.map((item) => <Card key={item.id}><StatusBadge status="ACTIVE" /><h2>{item.roleCode}</h2><p>Scope organisationnel : {item.scopeOrgId ?? "Global"}</p></Card>) : <EmptyState title="Aucune fonction active" description="Les fonctions actives apparaîtront ici après validation." />}</section><p className="muted"><Link href="/app/governance/appointments">Voir les nominations</Link></p></main></AppShell>;
}
