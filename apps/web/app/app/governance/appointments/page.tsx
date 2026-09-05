import Link from "next/link";
import { AppShell, EmptyState, PageHeader } from "@scouthub/ui";
export default function AppointmentsPage() { return <AppShell><main className="page wide"><PageHeader eyebrow="Gouvernance" title="Nominations" description="Suivez les nominations actives, en attente et historiques." /><EmptyState title="Aucune nomination à afficher" description="Les nominations seront disponibles lorsque le catalogue Position sera activé." /><Link href="/app/governance">Retour à la gouvernance</Link></main></AppShell>; }
