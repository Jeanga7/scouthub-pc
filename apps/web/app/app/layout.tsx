import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { requireActor } from "@/identity/http";
import { isLocalIdentityMode } from "@/identity/local-mode";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { readonly children: ReactNode }) {
  const incoming = await headers();
  const request = new Request(`${process.env.APP_ORIGIN ?? "http://localhost:3000"}/app`, {
    headers: { cookie: incoming.get("cookie") ?? "" }
  });
  let actor;
  try {
    actor = await requireActor(request, crypto.randomUUID());
  } catch {
    redirectToIdentity(isLocalIdentityMode(process.env) ? "/local-demo" : "/sign-in");
  }
  const permissions = new Set(actor.assignments
    .filter((assignment) => isRoleAssignmentActive(assignment, new Date()))
    .flatMap((assignment) => assignment.permissions));
  return (
    <div className="console-shell">
      <header className="console-header">
        <a className="brand" href="/app"><span className="brand-mark">S</span> ScoutHub-PC</a>
        <nav aria-label="Navigation principale">
          <a href="/app">Tableau de bord</a>
          {permissions.has("organization.read") ? <a href="/app/organizations">Organisations</a> : null}
          {permissions.has("project.read") ? <a href="/app/projects">Projets</a> : null}
          {permissions.has("project.review") ? <a href="/app/reviews">Validations</a> : null}
          {permissions.has("role.read") ? <a href="/app/admin/access">Administration</a> : null}
        </nav>
        <div className="account-area">
          <span>{actor.person?.displayName ?? actor.account.primaryEmail}</span>
          {isLocalIdentityMode(process.env) ? <a href="/local-demo">Changer de profil</a> : null}
        </div>
      </header>
      {children}
    </div>
  );
}

function redirectToIdentity(path: string): never {
  // Next typed routes omit the base path of optional catch-all auth routes.
  return redirect(path as Route);
}
