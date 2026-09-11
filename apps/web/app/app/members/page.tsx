import Link from "next/link";
import { headers } from "next/headers";
import type { UrlObject } from "url";
import {
  AppShell,
  Avatar,
  Breadcrumb,
  Button,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@scouthub/ui";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { requestId } from "@/organizations/http";
import { createMemberUseCases } from "@/members/service";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const incoming = await headers();
  const request = new Request("http://localhost/app/members", {
    headers: { cookie: incoming.get("cookie") ?? "" },
  });
  const actor = await requireActor(request, requestId(request));
  const assignment = actor.assignments.find(
    (item) =>
      item.scopeOrgId !== null &&
      item.scopePath !== null &&
      item.permissions.includes("member.read") &&
      isRoleAssignmentActive(item, new Date()),
  );
  const params = await searchParams;
  if (!assignment) {
    return (
      <AppShell>
        <main className="page">
          <EmptyState
            title="Accès refusé"
            description="Votre compte ne possède pas d'accès au registre membres."
          />
        </main>
      </AppShell>
    );
  }
  const page = Math.max(1, Number(value(params.page) ?? "1") || 1);
  const pageSize = 25;
  const result = await createMemberUseCases().listMembers({
    actor,
    tenantId: assignment.tenantId,
    query: value(params.q) ?? null,
    filterOrganizationIds: [
      value(params.districtId),
      value(params.groupId),
      value(params.annexId),
      value(params.unitId),
    ].filter((item): item is string => Boolean(item)),
    branch: value(params.branch) ?? null,
    status:
      value(params.status) === "INACTIVE"
        ? "INACTIVE"
        : value(params.status) === "ACTIVE"
          ? "ACTIVE"
          : null,
    page,
    pageSize,
  });
  const canCreate = actor.assignments.some(
    (item) =>
      item.tenantId === assignment.tenantId &&
      item.permissions.includes("member.create") &&
      isRoleAssignmentActive(item, new Date()),
  );
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));
  return (
    <AppShell>
      <main className="page wide members-page">
        <Breadcrumb
          items={[{ label: "Aujourd’hui", href: "/app" }, { label: "Membres" }]}
        />
        <PageHeader
          eyebrow="Registre régional"
          title="Membres"
          description="Recherche et consultation des personnes rattachées à votre périmètre."
          actions={
            canCreate ? (
              <Link className="sh-button-link" href="/app/members/new">
                Nouveau membre
              </Link>
            ) : null
          }
        />
        <form className="member-filters" action="/app/members">
          <input type="hidden" name="tenantId" value={assignment.tenantId} />
          <label>
            Recherche
            <input
              name="q"
              type="search"
              defaultValue={value(params.q) ?? ""}
              placeholder="Nom ou Scout ID"
            />
          </label>
          <label>
            Branche
            <select name="branch" defaultValue={value(params.branch) ?? ""}>
              <option value="">Toutes</option>
              <option>Jaune</option>
              <option>Verte</option>
              <option>Rouge</option>
            </select>
          </label>
          <label>
            Statut
            <select name="status" defaultValue={value(params.status) ?? ""}>
              <option value="">Tous</option>
              <option value="ACTIVE">Actif</option>
              <option value="INACTIVE">Inactif</option>
            </select>
          </label>
          <Button type="submit">Filtrer</Button>
        </form>
        {result.items.length ? (
          <>
            <section className="member-list" aria-label="Liste des membres">
              {result.items.map((member) => (
                <Link
                  className="member-row"
                  href={`/app/members/${member.personId}` as never}
                  key={member.personId}
                >
                  <Avatar name={member.displayName} />
                  <span className="scout-id-badge">{member.scoutId}</span>
                  <strong>{member.displayName}</strong>
                  <span>
                    {member.currentOrganization?.name ??
                      "Sans rattachement actif"}
                  </span>
                  <span>{member.branch ?? "Branche non renseignée"}</span>
                  <span>
                    {member.primaryAppointment?.title ??
                      "Aucune fonction active"}
                  </span>
                  <StatusBadge status={member.status} />
                </Link>
              ))}
            </section>
            <nav className="member-pagination" aria-label="Pagination">
              <Link aria-disabled={page <= 1} href={pageHref(params, page - 1)}>
                Précédent
              </Link>
              <span>
                Page {page} / {totalPages}
              </span>
              <Link
                aria-disabled={page >= totalPages}
                href={pageHref(params, page + 1)}
              >
                Suivant
              </Link>
            </nav>
          </>
        ) : (
          <EmptyState
            title="Aucun membre trouvé"
            description="Aucun membre ne correspond à cette recherche dans votre périmètre."
          />
        )}
      </main>
    </AppShell>
  );
}

function value(input: string | string[] | undefined): string | undefined {
  return Array.isArray(input) ? input[0] : input;
}

function pageHref(
  params: Record<string, string | string[] | undefined>,
  page: number,
): UrlObject {
  const target = new URLSearchParams();
  for (const [key, current] of Object.entries(params)) {
    const item = value(current);
    if (item && key !== "page") target.set(key, item);
  }
  target.set("page", String(Math.max(1, page)));
  return { pathname: "/app/members", query: Object.fromEntries(target) };
}
