"use client";

import type {
  AccountAdministrationResponse,
  InvitationResponse,
  RoleAssignmentResponse
} from "@scouthub/contracts";
import { useState } from "react";

interface Props {
  readonly tenantId: string;
  readonly scopeOrgId: string;
  readonly initialInvitations: readonly InvitationResponse[];
  readonly initialRoleAssignments: readonly RoleAssignmentResponse[];
  readonly initialAccounts: readonly AccountAdministrationResponse[];
}

export function AccessConsole({
  tenantId,
  scopeOrgId,
  initialInvitations,
  initialRoleAssignments,
  initialAccounts
}: Props) {
  const [message, setMessage] = useState("Ready");
  const [busy, setBusy] = useState(false);

  async function postJson(path: string, payload: unknown) {
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setMessage(body.detail ?? "Request failed.");
        return;
      }
      setMessage("Saved");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="org-console">
      <section className="panel">
        <p className="eyebrow">Access admin</p>
        <h1>Invitations et roles</h1>
        <p aria-live="polite">{busy ? "Traitement..." : message}</p>
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
        <button type="submit" disabled={busy}>Envoyer invitation</button>
      </form>

      <form
        className="panel org-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void postJson("/api/v1/role-assignments", {
            tenantId,
            accountId: data.get("accountId"),
            roleCode: data.get("roleCode"),
            scopeOrgId: data.get("scopeOrgId"),
            startsAt: dateTimeLocalToIso(data.get("startsAt")),
            endsAt: data.get("endsAt") === "" ? null : dateTimeLocalToIso(data.get("endsAt"))
          });
        }}
      >
        <h2>Assigner un role</h2>
        <label>
          Account
          <input name="accountId" required />
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
          <input name="scopeOrgId" defaultValue={scopeOrgId} required />
        </label>
        <label>
          Debut
          <input name="startsAt" type="datetime-local" required />
        </label>
        <label>
          Fin optionnelle
          <input name="endsAt" type="datetime-local" />
        </label>
        <button type="submit" disabled={busy}>Assigner role</button>
      </form>

      <section className="panel">
        <h2>Invitations</h2>
        <ul>
          {initialInvitations.map((invitation) => (
            <li key={invitation.id}>
              {invitation.email} · {invitation.intendedRoleCode} · {invitation.status}
              {invitation.status === "PENDING" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void postJson(`/api/v1/invitations/${invitation.id}/revoke`, { tenantId })
                  }
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Roles actifs visibles</h2>
        <ul>
          {initialRoleAssignments.map((assignment) => (
            <li key={assignment.id}>
              {assignment.accountId} · {assignment.roleCode} · {assignment.scopeType}
              {assignment.revokedAt === null ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void postJson(`/api/v1/role-assignments/${assignment.id}/revoke`, {
                      tenantId,
                      reason: "Revoked from access admin console"
                    })
                  }
                >
                  Revoke role
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Accounts administrables</h2>
        <ul>
          {initialAccounts.map((entry) => (
            <li key={entry.account.id}>
              {entry.person?.displayName ?? entry.account.id} · {entry.account.primaryEmail} · {entry.account.status}
              <span>
                {" "}· roles: {entry.activeRoleAssignments.map((assignment) => assignment.roleCode).join(", ")}
              </span>
              {entry.account.status === "ACTIVE" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void postJson(`/api/v1/accounts/${entry.account.id}/suspend`, { tenantId })
                  }
                >
                  Suspend account
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function dateTimeLocalToIso(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") {
    throw new Error("Expected date-time form value.");
  }
  return new Date(value).toISOString();
}
