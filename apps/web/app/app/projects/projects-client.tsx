"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import type {
  OrganizationResponse,
  ProjectOwnerOption,
  ProjectResponse
} from "@scouthub/contracts";

interface MeResponse {
  readonly account: { readonly id: string };
  readonly roleAssignments: readonly {
    readonly tenantId: string;
    readonly permissions: readonly string[];
    readonly scopeOrgId: string | null;
  }[];
}

export function ProjectsListClient() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [message, setMessage] = useState("Chargement...");

  const load = useCallback(async () => {
    try {
      const me = await fetchJson<MeResponse>("/api/v1/me");
      const assignment = me.roleAssignments.find((item) =>
        item.permissions.includes("project.read")
      );
      if (assignment === undefined) {
        setMessage("Aucun projet accessible.");
        return;
      }
      setTenantId(assignment.tenantId);
      const response = await fetchJson<{ readonly projects: ProjectResponse[] }>(
        `/api/v1/projects?tenantId=${assignment.tenantId}&limit=20`
      );
      setProjects(response.projects);
      setMessage(response.projects.length === 0 ? "Aucun brouillon accessible." : "");
    } catch {
      setMessage("Impossible de charger les projets.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel project-console">
      <div className="project-header">
        <div>
          <p className="eyebrow">Projects & Impact</p>
          <h1>Projets brouillons</h1>
        </div>
        {tenantId.length > 0 ? <a className="button-link" href="/app/projects/new">Nouveau projet</a> : null}
      </div>
      {message.length > 0 ? <p>{message}</p> : null}
      <div className="project-list">
        {projects.map((project) => (
          <article className="project-card" key={project.id}>
            <div>
              <h2><a href={`/app/projects/${project.id}/overview?tenantId=${project.tenantId}`}>{project.title}</a></h2>
              <p>{project.summary ?? "Brouillon sans resume."}</p>
            </div>
            <dl>
              <div><dt>Code</dt><dd>{project.code}</dd></div>
              <div><dt>Owner</dt><dd>{project.ownerOrganization.name}</dd></div>
              <div><dt>Mode</dt><dd>{project.projectMode}</dd></div>
              <div><dt>Statut</dt><dd>{project.status}</dd></div>
              <div><dt>Visibilite</dt><dd>{project.visibility}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

export function NewProjectClient() {
  const [tenantId, setTenantId] = useState("");
  const [owners, setOwners] = useState<ProjectOwnerOption[]>([]);
  const [step, setStep] = useState(1);
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [message, setMessage] = useState("Chargement...");

  const loadOwners = useCallback(async () => {
    try {
      const me = await fetchJson<MeResponse>("/api/v1/me");
      const assignment = me.roleAssignments.find((item) =>
        item.permissions.includes("project.create") && item.scopeOrgId !== null
      );
      if (assignment === undefined || assignment.scopeOrgId === null) {
        setMessage("Creation de projet non autorisee.");
        return;
      }
      setTenantId(assignment.tenantId);
      const root = await fetchJson<OrganizationResponse>(
        `/api/v1/organizations/${assignment.scopeOrgId}?tenantId=${assignment.tenantId}`
      );
      const descendants = await fetchJson<OrganizationResponse[]>(
        `/api/v1/organizations/${assignment.scopeOrgId}/descendants?tenantId=${assignment.tenantId}`
      );
      setOwners([root, ...descendants]
        .filter((org) => org.status === "ACTIVE" && (org.type === "GROUP" || org.type === "UNIT"))
        .map((org) => ({ id: org.id, name: org.name, type: org.type as "GROUP" | "UNIT", path: org.path })));
      setMessage("");
    } catch {
      setMessage("Impossible de charger les organisations.");
    }
  }, []);

  useEffect(() => {
    void loadOwners();
  }, [loadOwners]);

  async function createDraft(formData: FormData) {
    setMessage("Enregistrement...");
    try {
      const created = await postJson<ProjectResponse>("/api/v1/projects", {
        tenantId,
        ownerOrganizationId: requiredFormString(formData, "ownerOrganizationId"),
        title: requiredFormString(formData, "title"),
        projectMode: requiredFormString(formData, "projectMode")
      });
      setProject(created);
      setStep(2);
      setMessage("Brouillon cree.");
    } catch {
      setMessage("Creation refusee.");
    }
  }

  async function patchDraft(formData: FormData, nextStep: number) {
    if (project === null) {
      return;
    }
    setMessage("Enregistrement...");
    const payload: Record<string, unknown> = {
      tenantId,
      expectedVersion: project.version
    };
    for (const [key, value] of formData.entries()) {
      payload[key] = formValueForProjectPatch(key, value);
    }
    try {
      const updated = await patchJson<ProjectResponse>(`/api/v1/projects/${project.id}`, payload);
      setProject(updated);
      setStep(nextStep);
      setMessage("Brouillon enregistre.");
    } catch {
      setMessage("Sauvegarde refusee.");
    }
  }

  return (
    <section className="panel project-console">
      <p className="eyebrow">Nouveau projet</p>
      <h1>Brouillon Project</h1>
      {message.length > 0 ? <p role="status">{message}</p> : null}
      {step === 1 ? (
        <form className="project-form" action={createDraft}>
          <label htmlFor="ownerOrganizationId">Organisation proprietaire</label>
          <select id="ownerOrganizationId" name="ownerOrganizationId" required>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} ({owner.type})</option>)}
          </select>
          <label htmlFor="title">Titre</label>
          <input id="title" name="title" required maxLength={180} />
          <label htmlFor="projectMode">Mode</label>
          <select id="projectMode" name="projectMode">
            <option value="PLANNED">Projet planifie</option>
            <option value="ALREADY_COMPLETED">Projet deja realise</option>
          </select>
          <button type="submit">Creer le brouillon</button>
        </form>
      ) : null}
      {step === 2 && project !== null ? (
        <form className="project-form" action={(data) => patchDraft(data, 3)}>
          <label htmlFor="summary">Resume</label>
          <textarea id="summary" name="summary" defaultValue={project.summary ?? ""} />
          <label htmlFor="problemStatement">Probleme observe</label>
          <textarea id="problemStatement" name="problemStatement" defaultValue={project.problemStatement ?? ""} />
          <label htmlFor="diagnostic">Diagnostic</label>
          <textarea id="diagnostic" name="diagnostic" defaultValue={project.diagnostic ?? ""} />
          <button type="submit">Enregistrer et continuer</button>
        </form>
      ) : null}
      {step === 3 && project !== null ? (
        <form className="project-form" action={(data) => patchDraft(data, 3)}>
          <label htmlFor="locationLabel">Lieu</label>
          <input id="locationLabel" name="locationLabel" defaultValue={project.locationLabel ?? ""} />
          <label htmlFor="plannedStartAt">Debut prevu</label>
          <input id="plannedStartAt" name="plannedStartAt" type="datetime-local" />
          <label htmlFor="plannedEndAt">Fin prevue</label>
          <input id="plannedEndAt" name="plannedEndAt" type="datetime-local" />
          <label htmlFor="visibility">Visibilite interne</label>
          <select id="visibility" name="visibility" defaultValue={project.visibility}>
            <option value="PRIVATE">Private</option>
            <option value="INTERNAL">Internal</option>
          </select>
          <button type="submit">Enregistrer</button>
          <a className="button-link" href={`/app/projects/${project.id}/overview?tenantId=${tenantId}`}>Voir le brouillon</a>
        </form>
      ) : null}
    </section>
  );
}

export function ProjectOverviewClient({ projectId, initialTenantId }: {
  readonly projectId: string;
  readonly initialTenantId: string;
}) {
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [message, setMessage] = useState("Chargement...");

  const load = useCallback(async () => {
    try {
      const loaded = await fetchJson<ProjectResponse>(
        `/api/v1/projects/${projectId}?tenantId=${initialTenantId}`
      );
      setProject(loaded);
      setMessage("");
    } catch {
      setMessage("Projet inaccessible.");
    }
  }, [initialTenantId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(formData: FormData) {
    if (project === null) {
      return;
    }
    setMessage("Enregistrement...");
    try {
      const updated = await patchJson<ProjectResponse>(`/api/v1/projects/${project.id}`, {
        tenantId: project.tenantId,
        expectedVersion: project.version,
        title: requiredFormString(formData, "title"),
        summary: emptyToNull(formData.get("summary")),
        problemStatement: emptyToNull(formData.get("problemStatement")),
        diagnostic: emptyToNull(formData.get("diagnostic")),
        locationLabel: emptyToNull(formData.get("locationLabel")),
        visibility: requiredFormString(formData, "visibility")
      });
      setProject(updated);
      setMessage("Brouillon enregistre.");
    } catch {
      setMessage("Sauvegarde refusee.");
    }
  }

  return (
    <section className="panel project-console">
      {message.length > 0 ? <p role="status">{message}</p> : null}
      {project !== null ? (
        <>
          <p className="eyebrow">{project.status}</p>
          <h1>{project.title}</h1>
          <p>{project.code} - {project.ownerOrganization.name}</p>
          <form className="project-form" action={save}>
            <label htmlFor="title">Titre</label>
            <input id="title" name="title" required defaultValue={project.title} />
            <label htmlFor="summary">Resume</label>
            <textarea id="summary" name="summary" defaultValue={project.summary ?? ""} />
            <label htmlFor="problemStatement">Probleme observe</label>
            <textarea id="problemStatement" name="problemStatement" defaultValue={project.problemStatement ?? ""} />
            <label htmlFor="diagnostic">Diagnostic</label>
            <textarea id="diagnostic" name="diagnostic" defaultValue={project.diagnostic ?? ""} />
            <label htmlFor="locationLabel">Lieu</label>
            <input id="locationLabel" name="locationLabel" defaultValue={project.locationLabel ?? ""} />
            <label htmlFor="visibility">Visibilite</label>
            <select id="visibility" name="visibility" defaultValue={project.visibility}>
              <option value="PRIVATE">Private</option>
              <option value="INTERNAL">Internal</option>
            </select>
            <button type="submit">Enregistrer le brouillon</button>
          </form>
        </>
      ) : null}
    </section>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error("Request failed.");
  }
  const body = await response.json() as { readonly data: T };
  return body.data;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Request failed.");
  }
  const body = await response.json() as { readonly data: T };
  return body.data;
}

async function patchJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Request failed.");
  }
  const body = await response.json() as { readonly data: T };
  return body.data;
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return value;
}

function requiredFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    throw new Error(`Missing form field: ${key}`);
  }
  return value;
}

function formValueForProjectPatch(key: string, value: FormDataEntryValue): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  if (
    key === "plannedStartAt" ||
    key === "plannedEndAt" ||
    key === "actualStartAt" ||
    key === "actualEndAt"
  ) {
    return new Date(value).toISOString();
  }
  return value;
}
