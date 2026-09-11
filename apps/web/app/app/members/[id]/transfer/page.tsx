import { headers } from "next/headers";
import { AppShell, Breadcrumb, EmptyState, PageHeader } from "@scouthub/ui";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { mapMemberDetail } from "@/members/http";
import { createMemberUseCases } from "@/members/service";
import { mapOrganization, requestId } from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";
import { TransferForm } from "./transfer-form";

export const dynamic = "force-dynamic";

export default async function TransferMemberPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const incoming = await headers();
  const request = new Request(`http://localhost/app/members/${id}/transfer`, {
    headers: { cookie: incoming.get("cookie") ?? "" },
  });
  const actor = await requireActor(request, requestId(request));
  const assignment = actor.assignments.find(
    (item) =>
      item.scopeOrgId !== null &&
      item.permissions.includes("member.transfer") &&
      isRoleAssignmentActive(item, new Date()),
  );
  if (!assignment?.scopeOrgId) {
    return (
      <AppShell>
        <main className="page">
          <EmptyState
            title="Accès refusé"
            description="Votre compte ne peut pas transférer de membre."
          />
        </main>
      </AppShell>
    );
  }
  const useCases = createMemberUseCases();
  const member = mapMemberDetail(
    await useCases.getMember({
      actor,
      tenantId: assignment.tenantId,
      personId: id,
    }),
  );
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
            {
              label: member.displayName,
              href: `/app/members/${member.personId}`,
            },
            { label: "Transfert" },
          ]}
        />
        <PageHeader
          eyebrow="Rattachement"
          title="Transférer le membre"
          description="Changer la structure actuelle sans réécrire l'historique."
        />
        <TransferForm
          member={member}
          tenantId={assignment.tenantId}
          organizations={organizations}
        />
      </main>
    </AppShell>
  );
}
