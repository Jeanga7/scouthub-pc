import Link from "next/link";
import { headers } from "next/headers";
import { AppShell, Breadcrumb, EmptyState, StatusBadge } from "@scouthub/ui";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { requestId } from "@/organizations/http";
import { createMemberUseCases } from "@/members/service";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const incoming = await headers();
  const request = new Request(`http://localhost/app/members/${id}`, {
    headers: { cookie: incoming.get("cookie") ?? "" },
  });
  const actor = await requireActor(request, requestId(request));
  const assignment = actor.assignments.find(
    (item) =>
      item.scopeOrgId !== null &&
      item.permissions.includes("member.read") &&
      isRoleAssignmentActive(item, new Date()),
  );
  if (!assignment) {
    return <Denied />;
  }
  const member = await createMemberUseCases().getMember({
    actor,
    tenantId: assignment.tenantId,
    personId: id,
  });
  const canTransfer = actor.assignments.some(
    (item) =>
      item.tenantId === assignment.tenantId &&
      item.permissions.includes("member.transfer") &&
      isRoleAssignmentActive(item, new Date()),
  );
  return (
    <AppShell>
      <main className="page wide member-profile-page">
        <Breadcrumb
          items={[
            { label: "Membres", href: "/app/members" },
            { label: member.displayName },
          ]}
        />
        <header className="member-profile-header">
          <div>
            <span className="scout-id-badge">{member.scoutId}</span>
            <h1>{member.displayName}</h1>
            <p>
              {member.currentOrganization?.name ?? "Sans rattachement actif"} ·{" "}
              {member.status}
            </p>
          </div>
          <div className="member-profile-actions">
            <StatusBadge
              status={
                member.accountLinked
                  ? "Compte ScoutHub actif"
                  : "Pas encore de compte"
              }
            />
            {canTransfer ? (
              <Link
                className="sh-button-link"
                href={`/app/members/${member.personId}/transfer` as never}
              >
                Transférer
              </Link>
            ) : null}
          </div>
        </header>
        <section className="member-profile-grid">
          <article className="sh-card">
            <h2>Identité</h2>
            <dl className="profile-facts">
              <dt>Nom</dt>
              <dd>{member.lastName}</dd>
              <dt>Prénoms</dt>
              <dd>{member.firstName}</dd>
              <dt>Date de naissance</dt>
              <dd>
                {member.birthDate
                  ? member.birthDate.toLocaleDateString("fr-FR")
                  : "Non accessible"}
              </dd>
              <dt>Lieu de naissance</dt>
              <dd>{member.birthPlace ?? "Non renseigné"}</dd>
              <dt>Sexe</dt>
              <dd>{sexLabel(member.sex)}</dd>
            </dl>
          </article>
          <article className="sh-card">
            <h2>Rattachement</h2>
            <p className="member-breadcrumb">
              {member.ancestors.map((item) => item.name).join(" → ") ||
                "Aucun rattachement actif"}
            </p>
            <dl className="profile-facts">
              <dt>Structure actuelle</dt>
              <dd>{member.currentOrganization?.name ?? "Aucune"}</dd>
              <dt>Type</dt>
              <dd>{member.currentOrganization?.type ?? "Non renseigné"}</dd>
              <dt>Depuis</dt>
              <dd>
                {member.memberships
                  .find((item) => item.status === "ACTIVE")
                  ?.startsAt.toLocaleDateString("fr-FR") ?? "Non renseigné"}
              </dd>
            </dl>
          </article>
          <article className="sh-card">
            <h2>Responsabilités</h2>
            {member.activeAppointments.length ? (
              <ul className="plain-list">
                {member.activeAppointments.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.scopeName}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Aucune fonction active.</p>
            )}
          </article>
          <article className="sh-card">
            <h2>Contact</h2>
            <dl className="profile-facts">
              <dt>Téléphone</dt>
              <dd>{member.primaryPhone ?? "Non accessible"}</dd>
              <dt>Téléphone secondaire</dt>
              <dd>{member.secondaryPhone ?? "Non accessible"}</dd>
              <dt>Email</dt>
              <dd>{member.email ?? "Non accessible"}</dd>
              <dt>Responsable légal</dt>
              <dd>{member.guardianName ?? "Non accessible"}</dd>
            </dl>
          </article>
          <article className="sh-card">
            <h2>Administration</h2>
            <dl className="profile-facts">
              <dt>Assurance</dt>
              <dd>{member.insuranceNumber ?? "Non renseignée"}</dd>
              <dt>Année</dt>
              <dd>{member.insuranceYear ?? "Non renseignée"}</dd>
              <dt>Entrée scoutisme</dt>
              <dd>
                {member.joinedScoutingAt
                  ? member.joinedScoutingAt.toLocaleDateString("fr-FR")
                  : "Non renseignée"}
              </dd>
            </dl>
          </article>
          <article className="sh-card">
            <h2>Parcours</h2>
            <ol className="membership-timeline">
              {member.memberships.map((item) => (
                <li key={item.id}>
                  <strong>
                    {item.organizationName ?? item.organizationId}
                  </strong>
                  <span>
                    {item.status} · {item.startsAt.toLocaleDateString("fr-FR")}
                    {item.endsAt
                      ? ` - ${item.endsAt.toLocaleDateString("fr-FR")}`
                      : ""}
                  </span>
                </li>
              ))}
            </ol>
          </article>
        </section>
      </main>
    </AppShell>
  );
}

function Denied() {
  return (
    <AppShell>
      <main className="page">
        <EmptyState
          title="Accès refusé"
          description="Cette fiche n'est pas accessible avec votre périmètre."
        />
      </main>
    </AppShell>
  );
}

function sexLabel(value: string) {
  if (value === "FEMALE") return "Féminin";
  if (value === "MALE") return "Masculin";
  return "Non renseigné";
}
