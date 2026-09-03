import { redirect } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { localDemoPersonas } from "@/identity/local-personas";
import { isLocalIdentityMode } from "@/identity/local-mode";

export default function LocalDemoPage() {
  if (!isLocalIdentityMode(process.env)) {
    redirect("/sign-in" as Route);
  }
  return (
    <main className="page demo-login">
      <Link className="brand" href="/">ScoutHub-PC</Link>
      <section className="panel">
        <p className="eyebrow">Mode démonstration locale</p>
        <h1>Choisir un profil</h1>
        <p>Les droits affichés viennent exclusivement des RoleAssignments seedés en PostgreSQL.</p>
        <div className="persona-grid">
          {localDemoPersonas.map((persona) => (
            <form action="/api/dev/local-session" method="post" key={persona.selectorId}>
              <input name="persona" type="hidden" value={persona.selectorId} />
              <button className="persona-card" type="submit">
                <strong>{persona.label}</strong>
                <span>{persona.description}</span>
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
