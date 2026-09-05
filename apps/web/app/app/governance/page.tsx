import Link from "next/link";
import { headers } from "next/headers";
import {
  AppShell,
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@scouthub/ui";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { requestId } from "@/organizations/http";
import {
  createAppointmentUseCases,
  createPositionUseCases,
} from "@/governance/service";
import { createOrganizationUseCases } from "@/organizations/service";
export const dynamic = "force-dynamic";
export default async function GovernancePage() {
  const incoming = await headers();
  const request = new Request("http://localhost/app/governance", {
    headers: { cookie: incoming.get("cookie") ?? "" },
  });
  const actor = await requireActor(request, requestId(request));
  const scope = actor.assignments.find(
    (item) =>
      item.permissions.includes("appointment.read") &&
      isRoleAssignmentActive(item, new Date()),
  );
  const visibleOrganizationIds = new Set<string>();
  if (scope?.scopeOrgId) {
    const organizations = createOrganizationUseCases();
    visibleOrganizationIds.add(scope.scopeOrgId);
    for (const item of await organizations.listDescendants(
      scope.tenantId,
      scope.scopeOrgId,
    )) {
      visibleOrganizationIds.add(item.id);
    }
  }
  const appointments = scope
    ? (
        await createAppointmentUseCases().listAppointmentViews(scope.tenantId)
      ).filter((item) => visibleOrganizationIds.has(item.scopeOrgId))
    : [];
  const positions = scope
    ? await createPositionUseCases().listPositions(scope.tenantId)
    : [];
  const active = appointments.filter((item) => item.status === "ACTIVE");
  const pending = appointments.filter((item) => item.status === "PENDING");
  const technical = actor.assignments.filter((item) =>
    isRoleAssignmentActive(item, new Date()),
  );
  return (
    <AppShell>
      <main className="page wide">
        <PageHeader
          eyebrow="Administration"
          title="Fonctions & nominations"
          description="Les fonctions métier et les accès techniques sont gérés séparément."
          actions={
            <div className="card-actions">
              <Link className="button-link" href="/app/governance/appointments">
                Nominations
              </Link>
              <Link className="button-link" href="/app/governance/positions">
                Catalogue
              </Link>
            </div>
          }
        />
        <section className="governance-section">
          <h2>Appointments actifs</h2>
          {active.length ? (
            <div className="structure-grid">
              {active.map((item) => (
                <Card key={item.id}>
                  <StatusBadge status="ACTIVE" />
                  <h3>{item.positionTitle}</h3>
                  <p>{item.personName}</p>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucun appointment actif"
              description="Les nominations approuvées apparaîtront ici."
            />
          )}
        </section>
        <section className="governance-section">
          <h2>Appointments en attente</h2>
          <p>
            <strong>{pending.length}</strong> nomination(s) à traiter.
          </p>
        </section>
        <section className="governance-section">
          <h2>Catalogue des positions</h2>
          <p>
            <strong>{positions.length}</strong> fonction(s), dont{" "}
            {positions.filter((item) => item.active).length} active(s).{" "}
            <Link href="/app/governance/positions">Ouvrir le catalogue</Link>
          </p>
        </section>
        <section className="governance-section">
          <h2>Accès techniques</h2>
          {technical.length ? (
            <div className="structure-grid">
              {technical.map((item) => (
                <Card key={item.id}>
                  <StatusBadge status="ACCESS" />
                  <h3>{item.roleCode}</h3>
                  <p>Scope : {item.scopeOrgId ?? "Technique global"}</p>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucun accès technique"
              description="Aucun RoleAssignment actif pour ce compte."
            />
          )}
        </section>
      </main>
    </AppShell>
  );
}
