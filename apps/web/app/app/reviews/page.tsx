import { AppShell } from "@scouthub/ui";
import { ReviewsQueueClient } from "../projects/projects-client";

export const dynamic = "force-dynamic";

export default function ReviewsPage() {
  return (
    <AppShell>
      <main className="page wide">
        <ReviewsQueueClient />
      </main>
    </AppShell>
  );
}
