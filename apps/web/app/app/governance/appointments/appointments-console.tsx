"use client";
import { useState, type FormEvent } from "react";
import { Button, Card, EmptyState, Sheet, StatusBadge } from "@scouthub/ui";
import type {
  AccountAdministrationResponse,
  AppointmentResponse,
  OrganizationResponse,
  PositionResponse,
} from "@scouthub/contracts";
export function AppointmentsConsole(props: {
  tenantId: string;
  initialAppointments: AppointmentResponse[];
  positions: PositionResponse[];
  organizations: OrganizationResponse[];
  accounts: AccountAdministrationResponse[];
  canCreate: boolean;
  canValidate: boolean;
  canEnd: boolean;
}) {
  const [appointments, setAppointments] = useState(props.initialAppointments);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const position = new Map(
    props.positions.map((item) => [item.id, item.title]),
  );
  const organization = new Map(
    props.organizations.map((item) => [item.id, item.name]),
  );
  const person = new Map(
    props.accounts
      .filter((item) => item.person)
      .map((item) => [item.person!.id, item.person!.displayName]),
  );
  async function refresh() {
    const response = await fetch(
      `/api/v1/governance/appointments?tenantId=${props.tenantId}`,
    );
    const body = (await response.json()) as {
      data?: AppointmentResponse[];
      detail?: string;
    };
    if (body.data) setAppointments(body.data);
    else setError(body.detail ?? "Chargement impossible.");
  }
  async function decide(id: string, action: "approve" | "reject" | "end") {
    const response = await fetch(
      `/api/v1/governance/appointments/${id}/${action}?tenantId=${props.tenantId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    const body = (await response.json()) as { detail?: string };
    if (!response.ok) setError(body.detail ?? "Action impossible.");
    else {
      setError(null);
      await refresh();
    }
  }
  async function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const startsAt = data.get("startsAt");
    const endsAt = data.get("endsAt");
    if (typeof startsAt !== "string" || typeof endsAt !== "string") {
      setError("Dates invalides.");
      return;
    }
    const response = await fetch("/api/v1/governance/appointments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: props.tenantId,
        personId: data.get("personId"),
        positionId: data.get("positionId"),
        scopeOrgId: data.get("scopeOrgId"),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        notes: data.get("notes") || null,
      }),
    });
    const body = (await response.json()) as { detail?: string };
    if (!response.ok) return setError(body.detail ?? "Proposition impossible.");
    setOpen(false);
    setError(null);
    await refresh();
  }
  const section = (title: string, values: AppointmentResponse[]) => (
    <section className="governance-section">
      <h2>{title}</h2>
      {values.length ? (
        <div className="structure-grid">
          {values.map((item) => (
            <Card key={item.id}>
              <StatusBadge status={item.status} />
              <h3>
                {item.positionTitle ??
                  position.get(item.positionId) ??
                  item.positionId}
              </h3>
              <p>
                {item.personName ?? person.get(item.personId) ?? item.personId}
              </p>
              <p>
                {item.scopeName ??
                  organization.get(item.scopeOrgId) ??
                  item.scopeOrgId}
              </p>
              <p className="muted">
                Du {new Date(item.startsAt).toLocaleDateString("fr-FR")}
                {item.endsAt
                  ? ` au ${new Date(item.endsAt).toLocaleDateString("fr-FR")}`
                  : ""}
              </p>
              <div className="card-actions">
                {item.status === "PENDING" && props.canValidate ? (
                  <>
                    <Button onClick={() => void decide(item.id, "approve")}>
                      Approuver
                    </Button>
                    <Button onClick={() => void decide(item.id, "reject")}>
                      Rejeter
                    </Button>
                  </>
                ) : null}
                {item.status === "ACTIVE" && props.canEnd ? (
                  <Button onClick={() => void decide(item.id, "end")}>
                    Terminer
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title={`Aucun élément ${title.toLowerCase()}`}
          description="Aucune nomination dans cette catégorie."
        />
      )}
    </section>
  );
  return (
    <>
      {props.canCreate ? (
        <div className="governance-toolbar">
          <Button onClick={() => setOpen(true)}>Proposer une nomination</Button>
        </div>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {section(
        "En attente",
        appointments.filter((item) => item.status === "PENDING"),
      )}
      {section(
        "Actives",
        appointments.filter((item) => item.status === "ACTIVE"),
      )}
      {section(
        "Historique",
        appointments.filter(
          (item) => item.status === "ENDED" || item.status === "REJECTED",
        ),
      )}
      {open ? (
        <Sheet title="Proposer une nomination" onClose={() => setOpen(false)}>
          <form
            className="structure-form"
            onSubmit={(event) => void propose(event)}
          >
            <label>
              Personne
              <select name="personId" required>
                {props.accounts
                  .filter((item) => item.person)
                  .map((item) => (
                    <option key={item.person!.id} value={item.person!.id}>
                      {item.person!.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Fonction
              <select name="positionId" required>
                {props.positions
                  .filter((item) => item.active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Structure
              <select name="scopeOrgId" required>
                {props.organizations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.type})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Début
              <input type="date" name="startsAt" required />
            </label>
            <label>
              Fin prévue
              <input type="date" name="endsAt" />
            </label>
            <label>
              Notes
              <textarea name="notes" />
            </label>
            <Button type="submit">Proposer</Button>
          </form>
        </Sheet>
      ) : null}
    </>
  );
}
