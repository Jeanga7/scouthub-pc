"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@scouthub/ui";
import type { MemberDetail, OrganizationResponse } from "@scouthub/contracts";

export function TransferForm({
  member,
  tenantId,
  organizations,
}: {
  readonly member: MemberDetail;
  readonly tenantId: string;
  readonly organizations: OrganizationResponse[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const startsAtValue = data.get("startsAt");
    const startsAt = typeof startsAtValue === "string" ? startsAtValue : "";
    const response = await fetch(
      `/api/v1/members/${member.personId}/transfer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          organizationId: data.get("organizationId"),
          startsAt: new Date(startsAt).toISOString(),
          branch: data.get("branch") || null,
        }),
      },
    );
    const body = (await response.json()) as { detail?: string };
    if (!response.ok) {
      setError(body.detail ?? "Transfert impossible.");
      setLoading(false);
      return;
    }
    router.push(`/app/members/${member.personId}` as never);
  }
  return (
    <form className="member-form" onSubmit={(event) => void submit(event)}>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <fieldset>
        <legend>Structure actuelle</legend>
        <p>
          <strong>
            {member.currentOrganization?.name ?? "Aucun rattachement actif"}
          </strong>
        </p>
      </fieldset>
      <fieldset>
        <legend>Nouvelle structure</legend>
        <label>
          Destination
          <select name="organizationId" required>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.type})
              </option>
            ))}
          </select>
        </label>
        <label>
          Date d&apos;effet
          <input name="startsAt" type="date" required />
        </label>
        <label>
          Branche
          <select name="branch">
            <option value="">Dériver si unité</option>
            <option>Jaune</option>
            <option>Verte</option>
            <option>Rouge</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Confirmation</legend>
        <p className="muted">
          L&apos;ancien rattachement sera terminé et un nouveau rattachement
          actif sera créé. L&apos;historique reste conservé.
        </p>
      </fieldset>
      <Button type="submit" disabled={loading}>
        {loading ? "Transfert..." : "Confirmer le transfert"}
      </Button>
    </form>
  );
}
