import Link from "next/link";
import { AppShell, EmptyState, PageHeader } from "@scouthub/ui";
export default function PositionsPage() { return <AppShell><main className="page wide"><PageHeader eyebrow="Administration" title="Catalogue des fonctions" description="Les positions configurables seront administrées ici." /><EmptyState title="Catalogue en préparation" description="Les fonctions existantes restent gérées par les RoleAssignments pendant la transition." /><Link href="/app/governance">Retour à la gouvernance</Link></main></AppShell>; }
