import { headers } from "next/headers";
import { AppShell, Breadcrumb, EmptyState, PageHeader } from "@scouthub/ui";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { mapOrganization, requestId } from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";
import { MemberCreateForm } from "./member-create-form";

export const dynamic = "force-dynamic";

export default async function NewMemberPage() {
  const incoming = await headers();
  const request = new Request("http://localhost/app/members/new", {
    headers: { cookie: incoming.get("cookie") ?? "" },
  });
  const actor = await requireActor(request, requestId(request));
  const assignment = actor.assignments.find(
    (item) =>
      item.scopeOrgId !== null &&
      item.permissions.includes("member.create") &&
      isRoleAssignmentActive(item, new Date()),
  );
  if (!assignment?.scopeOrgId) {
    return (
      <AppShell>
        <main className="page">
          <EmptyState
            title="Accès refusé"
            description="Votre compte ne peut pas créer de membre."
          />
        </main>
      </AppShell>
    );
  }
  const organizationUseCases = createOrganizationUseCases();
  const root = await organizationUseCases.getOrganization(
    assignment.tenantId,
    assignment.scopeOrgId,
  );
  const organizations = [
    root,
    ...(await organizationUseCases.listDescendants(
      assignment.tenantId,
      assignment.scopeOrgId,
    )),
  ]
    .filter((item) =>
      ["REGION", "DISTRICT", "GROUP", "ANNEX", "UNIT"].includes(item.type),
    )
    .map(mapOrganization);
  return (
    <AppShell>
      <main className="page member-form-page">
        <Breadcrumb
          items={[
            { label: "Membres", href: "/app/members" },
            { label: "Nouveau membre" },
          ]}
        />
        <PageHeader
          eyebrow="Registre membres"
          title="Nouveau membre"
          description="Créer une personne, son profil scout et son rattachement initial en une transaction."
        />
        <MemberCreateForm
          tenantId={assignment.tenantId}
          organizations={organizations}
        />
      </main>
    </AppShell>
  );
}
