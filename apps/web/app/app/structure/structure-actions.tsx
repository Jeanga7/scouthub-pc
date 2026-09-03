"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { OrganizationResponse } from "@scouthub/contracts";
import { Button, Sheet } from "@scouthub/ui";

const parentTypes: Record<string, readonly string[]> = {
  DISTRICT: ["REGION"],
  GROUP: ["DISTRICT"],
  ANNEX: ["GROUP"],
  UNIT: ["GROUP", "ANNEX"]
};

export function StructureActions({ organizations, tenantId }: { readonly organizations: readonly OrganizationResponse[]; readonly tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("DISTRICT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowedParents = parentTypes[type] ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form))
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const detail = typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string" ? body.detail : "La structure n’a pas pu être créée.";
        setError(detail);
        return;
      }
      setOpen(false);
      window.location.reload();
    } catch {
      setError("La création est momentanément indisponible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return <><Button type="button" onClick={() => { setError(null); setOpen(true); }}>Nouvelle structure</Button>{open ? <Sheet title="Nouvelle structure" onClose={() => setOpen(false)}><form className="structure-form" onSubmit={(event) => { void submit(event); }}><input type="hidden" name="tenantId" value={tenantId} /><label>Type<select name="type" value={type} onChange={(event) => setType(event.target.value)} required><option value="DISTRICT">District</option><option value="GROUP">Groupe</option><option value="ANNEX">Annexe</option><option value="UNIT">Unité</option></select></label><label>Nom<input name="name" required /></label><label>Code<input name="code" required /></label><label>Parent<select name="parentId" required>{organizations.filter((item) => allowedParents.includes(item.type)).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.type})</option>)}</select></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={loading} type="submit">{loading ? "Création…" : "Créer"}</Button></form></Sheet> : null}</>;
}
