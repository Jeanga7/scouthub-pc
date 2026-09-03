import { AppShell } from "@scouthub/ui";
import { requestId } from "@/organizations/http";
import { requireActor } from "@/identity/http";
import { headers } from "next/headers";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { createProjectUseCases } from "@/projects/service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const incoming = await headers();
  const request = new Request("http://localhost/app", { headers: { cookie: incoming.get("cookie") ?? "" } });
  const actor = await requireActor(request, requestId(request));
  const active = actor.assignments.filter((assignment) => isRoleAssignmentActive(assignment, new Date()));
  const projectAssignment = active.find((assignment) => assignment.permissions.includes("project.read"));
  const reviewAssignment = active.find((assignment) => assignment.permissions.includes("project.review"));
  const useCases = createProjectUseCases();
  const projects = projectAssignment === undefined ? [] : (await useCases.listProjects({ actor, tenantId: projectAssignment.tenantId, limit: 50, cursor: null, filters: {} })).projects;
  const reviews = reviewAssignment === undefined ? [] : (await useCases.listRegionalReviewQueue({ actor, tenantId: reviewAssignment.tenantId, limit: 20, cursor: null, status: "PENDING" })).items;
  const statusCounts = projects.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.project.status]: (counts[item.project.status] ?? 0) + 1 }), {});

  return (
    <AppShell>
      <main className="page wide dashboard">
        <section className="dashboard-welcome">
          <div><p className="eyebrow">Tableau de bord</p><h1>Bonjour, {actor.person?.displayName ?? actor.account.primaryEmail}</h1><p>Votre espace de pilotage ScoutHub-PC.</p></div>
          <div className="scope-pill">{active[0]?.scopeType ?? "Aucun périmètre"}</div>
        </section>
        <section className="metric-grid">
          <article><strong>{projects.length}</strong><span>projets accessibles</span></article>
          <article><strong>{statusCounts.DRAFT ?? 0}</strong><span>brouillons en cours</span></article>
          <article><strong>{reviews.length}</strong><span>validations à traiter</span></article>
        </section>
        <section className="panel quick-actions"><div><p className="eyebrow">Actions rapides</p><h2>Continuer votre mission</h2></div><div className="action-row">
          {active.some((a) => a.permissions.includes("project.create")) ? <a className="button-link" href="/app/projects/new">Nouveau projet</a> : null}
          {projectAssignment ? <a className="secondary-link" href="/app/projects">Voir les projets</a> : null}
          {reviewAssignment ? <a className="secondary-link" href="/app/reviews">Voir les validations</a> : null}
        </div></section>
      </main>
    </AppShell>
  );
}
