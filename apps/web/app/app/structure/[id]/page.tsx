import Link from "next/link";
import { headers } from "next/headers";
import {
  AppShell,
  Breadcrumb,
  EmptyState,
  OrganizationCard,
  PageHeader,
  StatusBadge,
} from "@scouthub/ui";
import type { OrganizationResponse } from "@scouthub/contracts";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { mapOrganization, requestId } from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";
import {
  createAppointmentUseCases,
  createPositionUseCases,
} from "@/governance/service";
import { createMemberUseCases } from "@/members/service";

export const dynamic = "force-dynamic";

type StructureData = {
  readonly organization: OrganizationResponse;
  readonly children: OrganizationResponse[];
  readonly ancestors: OrganizationResponse[];
};

export default async function StructureDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const incoming = await headers();
  const request = new Request(`http://localhost/app/structure/${id}`, {
    headers: { cookie: incoming.get("cookie") ?? "" },
  });
  const actor = await requireActor(request, requestId(request));
  const assignment = actor.assignments.find(
    (item) =>
      item.scopeOrgId !== null &&
      item.permissions.includes("organization.read"),
  );

  if (!assignment?.scopeOrgId) return <AccessDenied />;
  const data = await loadStructure(assignment.tenantId, id);
  if (!data) return <NotFound />;

  const { organization, children, ancestors } = data;
  if (
    assignment.scopePath === null ||
    !organization.path.startsWith(assignment.scopePath)
  )
    return <AccessDenied />;
  const canReadAppointments = actor.assignments.some(
    (item) =>
      item.tenantId === assignment.tenantId &&
      item.scopePath !== null &&
      organization.path.startsWith(item.scopePath) &&
      item.permissions.includes("appointment.read") &&
      isRoleAssignmentActive(item, new Date()),
  );
  const appointments = canReadAppointments
    ? (
        await createAppointmentUseCases().listAppointmentViews(
          assignment.tenantId,
        )
      ).filter(
        (item) =>
          item.scopeOrgId === organization.id && item.status === "ACTIVE",
      )
    : [];
  const canReadMembers = actor.assignments.some(
    (item) =>
      item.tenantId === assignment.tenantId &&
      item.scopePath !== null &&
      organization.path.startsWith(item.scopePath) &&
      item.permissions.includes("member.read") &&
      isRoleAssignmentActive(item, new Date()),
  );
  const memberStats = canReadMembers
    ? await createMemberUseCases().aggregateMembers(
        actor,
        assignment.tenantId,
        {
          id: organization.id,
          tenantId: organization.tenantId,
          name: organization.name,
          type: organization.type,
          path: organization.path,
        },
      )
    : null;
  const positions = await createPositionUseCases().listPositions(
    assignment.tenantId,
  );
  return (
    <AppShell>
      <main className="page wide structure-page">
        <Breadcrumb
          items={[
            { label: "Structure", href: "/app/structure" },
            ...ancestors.map((item) => ({
              label: item.name,
              href: `/app/structure/${item.id}`,
            })),
            { label: organization.name },
          ]}
        />
        <PageHeader
          eyebrow={organization.type}
          title={organization.name}
          description={organization.locationLabel ?? "Structure ScoutHub-PC"}
        />
        <section className="structure-detail-grid">
          <div className="sh-card structure-facts">
            <span>Code</span>
            <strong>{organization.code}</strong>
            <span>Statut</span>
            <StatusBadge status={organization.status} />
            <span>Parent</span>
            <Link
              href={
                organization.parentId
                  ? `/app/structure/${organization.parentId}`
                  : "/app/structure"
              }
            >
              {ancestors.at(-1)?.name ?? "Région"}
            </Link>
          </div>
          <section>
            <h2>Enfants</h2>
            {children.length ? (
              <div className="structure-grid">
                {children.map((item) => (
                  <OrganizationCard
                    key={item.id}
                    name={item.name}
                    type={item.type}
                    status={item.status}
                    href={`/app/structure/${item.id}`}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Aucun enfant"
                description="Cette structure n’a pas encore de structure rattachée."
              />
            )}
          </section>
        </section>
        <section className="structure-section">
          <div className="section-heading-row">
            <h2>Membres</h2>
            {memberStats ? (
              <Link href={membersHref(organization) as never}>
                Voir tous les membres
              </Link>
            ) : null}
          </div>
          {memberStats ? (
            <div className="member-stats-grid">
              <div className="sh-card stat-tile">
                <span>Total actifs</span>
                <strong>{memberStats.totalActive}</strong>
              </div>
              {memberStats.byBranch.map((item) => (
                <div className="sh-card stat-tile" key={item.branch}>
                  <span>{item.branch}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Membres non accessibles"
              description="Les statistiques membres ne sont pas disponibles avec vos permissions."
            />
          )}
        </section>
        <section className="structure-section">
          <h2>Responsables / Maîtrise</h2>
          {appointments.length ? (
            <div className="structure-grid">
              {appointments.map((item) => (
                <div className="sh-card" key={item.id}>
                  <h3>
                    {positions.find(
                      (position) => position.id === item.positionId,
                    )?.title ?? item.positionTitle}
                  </h3>
                  <p>{item.personName}</p>
                  <p className="muted">
                    Du {item.startsAt.toLocaleDateString("fr-FR")}
                    {item.endsAt
                      ? ` au ${item.endsAt.toLocaleDateString("fr-FR")}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Aucun responsable actif"
              description="Aucune nomination active n’est rattachée à cette structure."
            />
          )}
        </section>
      </main>
    </AppShell>
  );
}

function membersHref(organization: OrganizationResponse): string {
  switch (organization.type) {
    case "DISTRICT":
      return `/app/members?districtId=${organization.id}`;
    case "GROUP":
      return `/app/members?groupId=${organization.id}`;
    case "ANNEX":
      return `/app/members?annexId=${organization.id}`;
    case "UNIT":
      return `/app/members?unitId=${organization.id}`;
    default:
      return "/app/members";
  }
}

async function loadStructure(
  tenantId: string,
  id: string,
): Promise<StructureData | null> {
  try {
    const useCases = createOrganizationUseCases();
    return {
      organization: mapOrganization(
        await useCases.getOrganization(tenantId, id),
      ),
      children: (await useCases.listChildren(tenantId, id)).map(
        mapOrganization,
      ),
      ancestors: (await useCases.listAncestors(tenantId, id)).map(
        mapOrganization,
      ),
    };
  } catch {
    return null;
  }
}

function AccessDenied() {
  return (
    <AppShell>
      <main className="page">
        <EmptyState
          title="Accès refusé"
          description="Cette structure n’est pas accessible avec votre périmètre."
        />
      </main>
    </AppShell>
  );
}

function NotFound() {
  return (
    <AppShell>
      <main className="page">
        <EmptyState
          title="Structure introuvable"
          description="La structure demandée n’existe pas dans votre périmètre."
        />
      </main>
    </AppShell>
  );
}
