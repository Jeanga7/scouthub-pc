import { headers } from "next/headers";
import { AppShell, EmptyState, PageHeader } from "@scouthub/ui";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { mapOrganization, requestId } from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";
import {
  createAppointmentUseCases,
  createGovernancePersonDirectoryUseCases,
  createPositionUseCases,
} from "@/governance/service";
import {
  mapAppointment,
  mapGovernancePersonOption,
  mapPosition,
} from "@/governance/http";
import { AppointmentsConsole } from "./appointments-console";
export const dynamic = "force-dynamic";
export default async function AppointmentsPage() {
  const incoming = await headers();
  const request = new Request("http://localhost/app/governance/appointments", {
    headers: { cookie: incoming.get("cookie") ?? "" },
  });
  const actor = await requireActor(request, requestId(request));
  const scope = actor.assignments.find(
    (item) =>
      item.scopeOrgId &&
      item.permissions.includes("appointment.read") &&
      isRoleAssignmentActive(item, new Date()),
  );
  if (!scope?.scopeOrgId)
    return (
      <AppShell>
        <main className="page">
          <EmptyState
            title="Accès refusé"
            description="Les nominations ne sont pas accessibles avec vos permissions."
          />
        </main>
      </AppShell>
    );
  const orgCases = createOrganizationUseCases();
  const root = await orgCases.getOrganization(scope.tenantId, scope.scopeOrgId);
  const organizations = [
    root,
    ...(await orgCases.listDescendants(scope.tenantId, scope.scopeOrgId)),
  ].map(mapOrganization);
  const allAppointments =
    await createAppointmentUseCases().listAppointmentViews(scope.tenantId);
  const visibleIds = new Set(organizations.map((item) => item.id));
  const positions = (
    await createPositionUseCases().listPositions(scope.tenantId)
  ).map(mapPosition);
  let people = [] as ReturnType<typeof mapGovernancePersonOption>[];
  try {
    people = (
      await createGovernancePersonDirectoryUseCases().searchPeople(
        scope.tenantId,
      )
    ).map(mapGovernancePersonOption);
  } catch {
    people = [];
  }
  const permissions = new Set(
    actor.assignments
      .filter(
        (item) =>
          item.tenantId === scope.tenantId &&
          isRoleAssignmentActive(item, new Date()),
      )
      .flatMap((item) => item.permissions),
  );
  return (
    <AppShell>
      <main className="page wide">
        <PageHeader
          eyebrow="Gouvernance"
          title="Nominations"
          description="Suivez les nominations actives, en attente et leur historique."
        />
        <AppointmentsConsole
          tenantId={scope.tenantId}
          initialAppointments={allAppointments
            .filter((item) => visibleIds.has(item.scopeOrgId))
            .map(mapAppointment)}
          positions={positions}
          organizations={organizations}
          people={people}
          canCreate={permissions.has("appointment.create")}
          canValidate={permissions.has("appointment.validate")}
          canEnd={permissions.has("appointment.end")}
        />
      </main>
    </AppShell>
  );
}
