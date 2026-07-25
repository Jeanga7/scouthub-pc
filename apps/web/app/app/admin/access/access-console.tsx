"use client";

import { useState } from "react";

interface Props {
  readonly tenantId: string;
  readonly scopeOrgId: string;
}

export function AccessConsole({ tenantId, scopeOrgId }: Props) {
  const [message, setMessage] = useState("Ready");

  async function postJson(path: string, payload: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json()) as { detail?: string };
    setMessage(response.ok ? "Saved" : (body.detail ?? "Request failed."));
  }

  return (
    <div className="org-console">
      <section className="panel">
        <p className="eyebrow">Access admin</p>
        <h1>Invitations et roles</h1>
        <p>{message}</p>
      </section>

      <form
        className="panel org-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void postJson("/api/v1/invitations", {
            tenantId,
            email: data.get("email"),
            firstName: data.get("firstName"),
            lastName: data.get("lastName"),
            roleCode: data.get("roleCode"),
            scopeOrganizationId: data.get("scopeOrganizationId"),
            adultEligibilityConfirmed: data.get("adultEligibilityConfirmed") === "on"
          });
        }}
      >
        <h2>Inviter un adulte</h2>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Prenom
          <input name="firstName" required />
        </label>
        <label>
          Nom
          <input name="lastName" required />
        </label>
        <label>
          Role
          <select name="roleCode" defaultValue="GROUP_ADMIN">
            <option value="UNIT_LEADER">Unit leader</option>
            <option value="GROUP_ADMIN">Group admin</option>
            <option value="DISTRICT_REVIEWER">District reviewer</option>
            <option value="REGIONAL_PROGRAMME_REVIEWER">Regional programme reviewer</option>
            <option value="REGIONAL_ADMIN">Regional admin</option>
            <option value="REGIONAL_COMMS">Regional comms</option>
            <option value="DATA_OFFICER">Data officer</option>
          </select>
        </label>
        <label>
          Scope organization
          <input name="scopeOrganizationId" defaultValue={scopeOrgId} required />
        </label>
        <label>
          <input name="adultEligibilityConfirmed" type="checkbox" required />
          Eligibilite adulte attestee
        </label>
        <button type="submit">Envoyer invitation</button>
      </form>
    </div>
  );
}

