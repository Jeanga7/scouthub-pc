import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isRoleAssignmentActive } from "@scouthub/domain";
import { BottomNav, Sidebar } from "@scouthub/ui";
import { requireActor } from "@/identity/http";
import { isLocalIdentityMode } from "@/identity/local-mode";
import { MobileActions } from "./mobile-actions";

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
    const identityPath = isLocalIdentityMode(process.env) ? "/local-demo" : "/sign-in/";
    redirect(identityPath);
  }
  const permissions = new Set(actor.assignments
    .filter((assignment) => isRoleAssignmentActive(assignment, new Date()))
    .flatMap((assignment) => assignment.permissions));
  return (
    <div className="console-shell">
      <Sidebar><Link className="brand" href="/app"><span className="brand-mark">S</span> ScoutHub-PC</Link><span className="nav-label">Aujourd’hui</span><Link href="/app">Tableau de bord</Link><span className="nav-label">Pilotage</span>{permissions.has("organization.read") ? <Link href="/app/structure">Structure</Link> : null}{permissions.has("project.read") ? <Link href="/app/projects">Projets</Link> : null}<span className="nav-label">Administration</span>{permissions.has("role.read") ? <><Link href="/app/governance">Fonctions & nominations</Link><Link href="/app/admin/access">Accès</Link></> : null}</Sidebar>
      <header className="console-header">
        <div className="topbar-context"><span className="brand-mark">S</span><span>ScoutHub-PC</span></div>
        <div className="account-area">
          <span>{actor.person?.displayName ?? actor.account.primaryEmail}</span>
          {isLocalIdentityMode(process.env) ? <a href="/local-demo">Changer de profil</a> : null}
        </div>
      </header>
      {children}
      <BottomNav><Link href="/app">Aujourd’hui</Link>{permissions.has("organization.read") ? <Link href="/app/structure">Structure</Link> : null}<MobileActions canCreateProject={permissions.has("project.create")} canCreateOrganization={permissions.has("organization.create")} />{permissions.has("project.read") ? <Link href="/app/projects">Projets</Link> : null}<Link href={isLocalIdentityMode(process.env) ? "/local-demo" : "/app"}>Plus</Link></BottomNav>
    </div>
  );
}
