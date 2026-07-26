import { AppShell } from "@scouthub/ui";
import { ProjectReviewsClient } from "../../projects-client";

export const dynamic = "force-dynamic";

export default async function ProjectReviewsPage({
  params,
  searchParams
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ tenantId?: string }>;
}) {
  const [{ id }, { tenantId }] = await Promise.all([params, searchParams]);
  return (
    <AppShell>
      <main className="page">
        <ProjectReviewsClient projectId={id} initialTenantId={tenantId ?? ""} />
      </main>
    </AppShell>
  );
}
