import { headers } from "next/headers";
import { AppShell, EmptyState, PageHeader } from "@scouthub/ui";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { requestId } from "@/organizations/http";
import { createPositionUseCases } from "@/governance/service";
import { mapPosition } from "@/governance/http";
import { PositionsConsole } from "./positions-console";
export const dynamic = "force-dynamic";
export default async function PositionsPage() {
  const incoming = await headers();
  const request = new Request("http://localhost/app/governance/positions", {
    headers: { cookie: incoming.get("cookie") ?? "" },
  });
  const actor = await requireActor(request, requestId(request));
  const assignment = actor.assignments.find(
    (item) =>
      item.permissions.includes("position.read") &&
      isRoleAssignmentActive(item, new Date()),
  );
  if (!assignment)
    return (
      <AppShell>
        <main className="page">
          <EmptyState
            title="Accès refusé"
            description="Le catalogue n’est pas accessible avec vos permissions."
          />
        </main>
      </AppShell>
    );
  const positions = (
    await createPositionUseCases().listPositions(assignment.tenantId)
  ).map(mapPosition);
  const canManage = actor.assignments.some(
    (item) =>
      item.tenantId === assignment.tenantId &&
      item.permissions.includes("position.manage") &&
      isRoleAssignmentActive(item, new Date()),
  );
  return (
    <AppShell>
      <main className="page wide">
        <PageHeader
          eyebrow="Administration"
          title="Catalogue des fonctions"
          description="Créez et maintenez les fonctions métier disponibles par type de structure."
        />
        <PositionsConsole
          tenantId={assignment.tenantId}
          initialPositions={positions}
          canManage={canManage}
        />
      </main>
    </AppShell>
  );
}
