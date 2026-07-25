import { AppShell } from "@scouthub/ui";
import { requestId } from "@/organizations/http";
import { requireActor } from "@/identity/http";

export const dynamic = "force-dynamic";

export default async function PrivateAppPlaceholderPage() {
  const request = new Request("http://localhost/app");
  const actor = await requireActor(request, requestId(request));

  return (
    <AppShell>
      <main className="page">
        <section className="panel">
          <p className="eyebrow">Espace prive</p>
          <h1>Console ScoutHub</h1>
          <p>
            Connecte comme {actor.person?.displayName ?? actor.account.primaryEmail}.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
