"use client";

import { useState } from "react";
import type { OrganizationResponse } from "@scouthub/contracts";

interface Props {
  readonly initialTenantId: string;
  readonly initialScopeOrganizationId: string;
  readonly initialOrganizations: OrganizationResponse[];
}

export function OrganizationsConsole({
  initialTenantId,
  initialScopeOrganizationId,
  initialOrganizations
}: Props) {
  const [tenantId, setTenantId] = useState(initialTenantId);
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [message, setMessage] = useState("Ready");

  async function refresh(nextTenantId = tenantId) {
    if (nextTenantId.length === 0) {
      return;
    }
    const response = await fetch(
      `/api/v1/organizations/${initialScopeOrganizationId}/descendants?tenantId=${nextTenantId}`
    );
    const body = (await response.json()) as { data?: OrganizationResponse[]; detail?: string };
    if (!response.ok || body.data === undefined) {
      setMessage(body.detail ?? "Unable to load organizations.");
      return;
    }
    const root = await fetch(`/api/v1/organizations/${initialScopeOrganizationId}?tenantId=${nextTenantId}`);
    const rootBody = (await root.json()) as { data?: OrganizationResponse };
    setOrganizations(rootBody.data === undefined ? body.data : [rootBody.data, ...body.data]);
    setMessage("Loaded");
  }

  async function postJson(path: string, payload: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json()) as { data?: OrganizationResponse; detail?: string };
    setMessage(response.ok ? "Saved" : (body.detail ?? "Request failed."));
    if (response.ok && tenantId.length > 0) {
      await refresh();
    }
    return body.data;
  }

  async function patchJson(path: string, payload: unknown) {
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json()) as { detail?: string };
    setMessage(response.ok ? "Updated" : (body.detail ?? "Request failed."));
    if (response.ok && tenantId.length > 0) {
      await refresh();
    }
  }

  return (
    <div className="org-console">
      <section className="panel">
        <p className="eyebrow">Structure régionale</p>
        <h1>Organisations</h1>
        <p>{message}</p>
      </section>

      <section className="org-grid">
        <form
          className="panel org-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void postJson("/api/v1/organizations/root", {
              name: data.get("name"),
              code: data.get("code"),
              locationLabel: data.get("locationLabel") || null
            }).then((created) => {
              if (created !== undefined) {
                setTenantId(created.tenantId);
                void refresh(created.tenantId);
              }
            });
          }}
        >
          <h2>Create NSO root</h2>
          <label>
            Name
            <input name="name" placeholder="Name" required />
          </label>
          <label>
            Code
            <input name="code" placeholder="Code" required />
          </label>
          <label>
            Location
            <input name="locationLabel" placeholder="Location" />
          </label>
          <button type="submit">Create root</button>
        </form>

        <form
          className="panel org-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void postJson("/api/v1/organizations", {
              tenantId,
              parentId: data.get("parentId"),
              type: data.get("type"),
              name: data.get("name"),
              code: data.get("code"),
              locationLabel: data.get("locationLabel") || null
            });
          }}
        >
          <h2>Create child</h2>
          <label>
            Type
            <select name="type" required>
              <option value="REGION">Region</option>
              <option value="DISTRICT">District</option>
              <option value="GROUP">Group</option>
              <option value="UNIT">Unit</option>
            </select>
          </label>
          <label>
            Parent UUID
            <input name="parentId" placeholder="Parent UUID" required />
          </label>
          <label>
            Name
            <input name="name" placeholder="Name" required />
          </label>
          <label>
            Code
            <input name="code" placeholder="Code" required />
          </label>
          <label>
            Location
            <input name="locationLabel" placeholder="Location" />
          </label>
          <button type="submit">Create</button>
        </form>
      </section>

      <section className="panel org-form">
        <label>
          Tenant ID
          <input
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            placeholder="Tenant UUID"
          />
        </label>
        <button type="button" onClick={() => void refresh()}>
          Load tree
        </button>
      </section>

      <section className="org-list">
        {organizations.map((organization) => (
          <article className="panel org-item" key={organization.id}>
            <div>
              <strong style={{ paddingLeft: `${organization.depth * 18}px` }}>
                {organization.name}
              </strong>
              <span>{organization.type}</span>
              <span>{organization.code}</span>
              <span>{organization.status}</span>
              <span>Depth {organization.depth}</span>
              <code>{organization.id}</code>
            </div>
            <form
              className="org-inline"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void patchJson(`/api/v1/organizations/${organization.id}`, {
                  tenantId,
                  expectedVersion: organization.version,
                  name: data.get("name"),
                  code: data.get("code"),
                  locationLabel: data.get("locationLabel") || null
                });
              }}
            >
              <label>
                Name
                <input name="name" defaultValue={organization.name} required />
              </label>
              <label>
                Code
                <input name="code" defaultValue={organization.code} required />
              </label>
              <label>
                Location
                <input
                  name="locationLabel"
                  defaultValue={organization.locationLabel ?? ""}
                />
              </label>
              <button type="submit">Update</button>
            </form>
            <form
              className="org-inline"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void postJson(`/api/v1/organizations/${organization.id}/move`, {
                  tenantId,
                  expectedVersion: organization.version,
                  newParentId: data.get("newParentId")
                });
              }}
            >
              <label>
                New parent UUID
                <input name="newParentId" placeholder="New parent UUID" />
              </label>
              <button type="submit">Move</button>
            </form>
            <button
              type="button"
              onClick={() =>
                void postJson(`/api/v1/organizations/${organization.id}/activate`, {
                  tenantId,
                  expectedVersion: organization.version
                })
              }
            >
              Activate
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
