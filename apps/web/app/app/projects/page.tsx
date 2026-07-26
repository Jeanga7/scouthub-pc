import { AppShell } from "@scouthub/ui";
import { ProjectsListClient } from "./projects-client";

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  return (
    <AppShell>
      <main className="page wide">
        <ProjectsListClient />
      </main>
    </AppShell>
  );
}

