"use client";

import { useState } from "react";
import type { OrganizationResponse } from "@scouthub/contracts";
import { Button, Sheet } from "@scouthub/ui";

export function StructureActions({ organizations, tenantId }: { readonly organizations: readonly OrganizationResponse[]; readonly tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("DISTRICT");
  const allowedParents = type === "DISTRICT" ? ["REGION"] : type === "GROUP" ? ["DISTRICT", "REGION"] : type === "ANNEX" ? ["GROUP"] : ["GROUP", "ANNEX"];
  return <><Button type="button" onClick={() => setOpen(true)}>Nouvelle structure</Button>{open ? <Sheet title="Nouvelle structure" onClose={() => setOpen(false)}><form className="structure-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void fetch("/api/v1/organizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }).then(() => window.location.reload()); }}><input type="hidden" name="tenantId" value={tenantId} /><label>Type<select name="type" value={type} onChange={(event) => setType(event.target.value)} required><option value="DISTRICT">District</option><option value="GROUP">Groupe</option><option value="ANNEX">Annexe</option><option value="UNIT">Unité</option></select></label><label>Nom<input name="name" required /></label><label>Code<input name="code" required /></label><label>Parent<select name="parentId" required>{organizations.filter((item) => allowedParents.includes(item.type)).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.type})</option>)}</select></label><Button type="submit">Créer</Button></form></Sheet> : null}</>;
}
