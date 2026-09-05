"use client";
import { useState, type FormEvent } from "react";
import { Button, Card, EmptyState, Sheet, StatusBadge } from "@scouthub/ui";
import type { PositionResponse } from "@scouthub/contracts";
export function PositionsConsole({
  tenantId,
  initialPositions,
  canManage,
}: {
  tenantId: string;
  initialPositions: PositionResponse[];
  canManage: boolean;
}) {
  const [positions, setPositions] = useState(initialPositions);
  const [editing, setEditing] = useState<PositionResponse | null | "new">(null);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    const response = await fetch(
      `/api/v1/governance/positions?tenantId=${tenantId}`,
    );
    const body = (await response.json()) as {
      data?: PositionResponse[];
      detail?: string;
    };
    if (body.data) setPositions(body.data);
    else setError(body.detail ?? "Chargement impossible.");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = editing === "new" ? null : editing;
    const payload = {
      code: data.get("code"),
      title: data.get("title"),
      description: data.get("description") || null,
      allowedScopeTypes: data.getAll("allowedScopeTypes"),
      sector: data.get("sector") || null,
      branch: data.get("branch") || null,
      holderPolicy: data.get("holderPolicy"),
    };
    const response = await fetch(
      current
        ? `/api/v1/governance/positions/${current.id}?tenantId=${tenantId}`
        : `/api/v1/governance/positions?tenantId=${tenantId}`,
      {
        method: current ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = (await response.json()) as { detail?: string };
    if (!response.ok)
      return setError(body.detail ?? "Enregistrement impossible.");
    setEditing(null);
    setError(null);
    await refresh();
  }
  async function deactivate(position: PositionResponse) {
    const response = await fetch(
      `/api/v1/governance/positions/${position.id}?tenantId=${tenantId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: false }),
      },
    );
    if (!response.ok) {
      const body = (await response.json()) as { detail?: string };
      setError(body.detail ?? "Désactivation impossible.");
    } else await refresh();
  }
  return (
    <>
      <div className="governance-toolbar">
        {canManage ? (
          <Button onClick={() => setEditing("new")}>Créer une fonction</Button>
        ) : null}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="structure-grid">
        {positions.length ? (
          positions.map((position) => (
            <Card key={position.id}>
              <StatusBadge status={position.active ? "ACTIVE" : "INACTIVE"} />
              <h2>{position.title}</h2>
              <p>
                {position.code} ·{" "}
                {position.holderPolicy === "SINGLE"
                  ? "Titulaire unique"
                  : "Plusieurs titulaires"}
              </p>
              <p className="muted">{position.allowedScopeTypes.join(", ")}</p>
              {canManage ? (
                <div className="card-actions">
                  <Button onClick={() => setEditing(position)}>Modifier</Button>
                  {position.active ? (
                    <Button onClick={() => void deactivate(position)}>
                      Désactiver
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ))
        ) : (
          <EmptyState
            title="Aucune fonction"
            description="Le catalogue ne contient aucune position."
          />
        )}
      </section>
      {editing ? (
        <Sheet
          title={
            editing === "new" ? "Nouvelle fonction" : "Modifier la fonction"
          }
          onClose={() => setEditing(null)}
        >
          <form
            className="structure-form"
            onSubmit={(event) => void save(event)}
          >
            <label>
              Code
              <input
                name="code"
                defaultValue={editing === "new" ? "" : editing.code}
                required
              />
            </label>
            <label>
              Intitulé
              <input
                name="title"
                defaultValue={editing === "new" ? "" : editing.title}
                required
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                defaultValue={
                  editing === "new" ? "" : (editing.description ?? "")
                }
              />
            </label>
            <label>
              Secteur
              <input
                name="sector"
                defaultValue={editing === "new" ? "" : (editing.sector ?? "")}
              />
            </label>
            <label>
              Branche
              <input
                name="branch"
                defaultValue={editing === "new" ? "" : (editing.branch ?? "")}
              />
            </label>
            <fieldset>
              <legend>Structures autorisées</legend>
              {[
                "NSO",
                "REGION",
                "DISTRICT",
                "GROUP",
                "ANNEX",
                "UNIT",
                "TEAM",
              ].map((type) => (
                <label key={type}>
                  <input
                    type="checkbox"
                    name="allowedScopeTypes"
                    value={type}
                    defaultChecked={
                      editing !== "new" &&
                      editing.allowedScopeTypes.includes(type as never)
                    }
                  />{" "}
                  {type}
                </label>
              ))}
            </fieldset>
            <label>
              Politique
              <select
                name="holderPolicy"
                defaultValue={
                  editing === "new" ? "SINGLE" : editing.holderPolicy
                }
              >
                <option value="SINGLE">Titulaire unique</option>
                <option value="MULTIPLE">Plusieurs titulaires</option>
              </select>
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <Button type="submit">Enregistrer</Button>
          </form>
        </Sheet>
      ) : null}
    </>
  );
}
