import { AppShell } from "@scouthub/ui";
import { NewProjectClient } from "../projects-client";

export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  return (
    <AppShell>
      <main className="page">
        <NewProjectClient />
      </main>
    </AppShell>
  );
}

