"use client";

import Link from "next/link";
import { useState } from "react";
import { IconButton, Sheet } from "@scouthub/ui";

export function MobileActions({ canCreateProject, canCreateOrganization }: { readonly canCreateProject: boolean; readonly canCreateOrganization: boolean }) {
  const [open, setOpen] = useState(false);
  if (!canCreateProject && !canCreateOrganization) return null;
  return <><IconButton className="bottom-action" label="Créer" type="button" onClick={() => setOpen(true)}>+</IconButton>{open ? <Sheet title="Créer" onClose={() => setOpen(false)}><div className="mobile-action-list">{canCreateProject ? <Link href="/app/projects/new" onClick={() => setOpen(false)}>Nouveau projet</Link> : null}{canCreateOrganization ? <Link href="/app/structure" onClick={() => setOpen(false)}>Nouvelle structure</Link> : null}</div></Sheet> : null}</>;
}
