"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import type {
  ProjectOwnerOption,
  ProjectReviewHistoryResponse,
  ReviewQueueResponse,
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
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [message, setMessage] = useState("Chargement...");

  const load = useCallback(async (cursor?: string) => {
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
      const params = new URLSearchParams({
        tenantId: assignment.tenantId,
        limit: "20"
      });
      if (cursor !== undefined) {
        params.set("cursor", cursor);
      }
      const response = await fetchJson<{
        readonly projects: ProjectResponse[];
        readonly nextCursor: string | null;
      }>(
        `/api/v1/projects?${params.toString()}`
      );
      setProjects((current) => cursor === undefined ? response.projects : [...current, ...response.projects]);
      setNextCursor(response.nextCursor);
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
              <p><a href={`/app/projects/${project.id}/reviews?tenantId=${project.tenantId}`}>Historique de revue</a></p>
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
      {nextCursor !== null ? (
        <button type="button" onClick={() => { void load(nextCursor); }}>Charger plus</button>
      ) : null}
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
        item.permissions.includes("project.create")
      );
      if (assignment === undefined) {
        setMessage("Creation de projet non autorisee.");
        return;
      }
      setTenantId(assignment.tenantId);
      const options = await fetchJson<ProjectOwnerOption[]>(
        `/api/v1/projects/owner-options?tenantId=${assignment.tenantId}`
      );
      setOwners(options);
      setMessage(options.length === 0 ? "Aucune organisation eligible." : "");
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

  async function submitForReview() {
    if (project === null) {
      return;
    }
    setMessage("Soumission...");
    try {
      const response = await postJson<{ readonly project: ProjectResponse }>(
        `/api/v1/projects/${project.id}/submit`,
        { tenantId: project.tenantId, expectedVersion: project.version }
      );
      setProject(response.project);
      setMessage("Projet soumis pour revue.");
    } catch {
      setMessage("Soumission refusee.");
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
          <p><a href={`/app/projects/${project.id}/reviews?tenantId=${project.tenantId}`}>Voir les retours</a></p>
          {statusMessage(project.status) !== null ? <p>{statusMessage(project.status)}</p> : null}
          {project.capabilities?.canSubmit === true ? (
            <button type="button" onClick={() => { void submitForReview(); }}>
              {project.status === "CHANGES_REQUESTED" ? "Resoumettre" : "Soumettre pour revue"}
            </button>
          ) : null}
          {project.capabilities?.canUpdate === true ? (
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
          ) : (
            <dl className="project-readonly">
              <div><dt>Resume</dt><dd>{project.summary ?? "Non renseigne"}</dd></div>
              <div><dt>Probleme observe</dt><dd>{project.problemStatement ?? "Non renseigne"}</dd></div>
              <div><dt>Diagnostic</dt><dd>{project.diagnostic ?? "Non renseigne"}</dd></div>
              <div><dt>Lieu</dt><dd>{project.locationLabel ?? "Non renseigne"}</dd></div>
              <div><dt>Visibilite</dt><dd>{project.visibility}</dd></div>
            </dl>
          )}
        </>
      ) : null}
    </section>
  );
}

export function ProjectReviewsClient({ projectId, initialTenantId }: {
  readonly projectId: string;
  readonly initialTenantId: string;
}) {
  const [history, setHistory] = useState<ProjectReviewHistoryResponse | null>(null);
  const [message, setMessage] = useState("Chargement...");

  const load = useCallback(async () => {
    try {
      const loaded = await fetchJson<ProjectReviewHistoryResponse>(
        `/api/v1/projects/${projectId}/reviews?tenantId=${initialTenantId}`
      );
      setHistory(loaded);
      setMessage("");
    } catch {
      setMessage("Historique inaccessible.");
    }
  }, [initialTenantId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel project-console">
      <p className="eyebrow">Revue</p>
      <h1>Historique du projet</h1>
      {message.length > 0 ? <p role="status">{message}</p> : null}
      {history !== null && history.cycles.length === 0 ? <p>Aucun cycle de revue.</p> : null}
      {history?.cycles.map((cycle, index) => (
        <article className="project-card" key={cycle.approvalRequest.id}>
          <h2>Cycle {index + 1}</h2>
          <dl>
            <div><dt>Statut</dt><dd>{cycle.approvalRequest.status}</dd></div>
            <div><dt>Version soumise</dt><dd>{cycle.approvalRequest.submittedProjectVersion}</dd></div>
            <div><dt>Soumis le</dt><dd>{cycle.approvalRequest.requestedAt}</dd></div>
          </dl>
          {cycle.comments.map((comment) => (
            <p key={comment.id}><strong>{comment.kind}</strong> {comment.fieldKey ?? ""}: {comment.body}</p>
          ))}
          {cycle.decision !== null ? (
            <p>Decision: {cycle.decision.decision}{cycle.decision.reason !== null ? ` - ${cycle.decision.reason}` : ""}</p>
          ) : null}
        </article>
      ))}
      {history !== null ? (
        <div className="project-list">
          {history.transitions.map((transition) => (
            <p key={transition.id}>{transition.fromState} {"->"} {transition.toState} ({transition.occurredAt})</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ReviewsQueueClient() {
  const [tenantId, setTenantId] = useState("");
  const [queue, setQueue] = useState<ReviewQueueResponse["items"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [message, setMessage] = useState("Chargement...");

  const load = useCallback(async (cursor?: string) => {
    try {
      const me = await fetchJson<MeResponse>("/api/v1/me");
      const assignment = me.roleAssignments.find((item) =>
        item.permissions.includes("project.review")
      );
      if (assignment === undefined) {
        setMessage("Aucune revue regionale accessible.");
        return;
      }
      setTenantId(assignment.tenantId);
      const params = new URLSearchParams({ tenantId: assignment.tenantId, limit: "20" });
      if (cursor !== undefined) {
        params.set("cursor", cursor);
      }
      const response = await fetchJson<ReviewQueueResponse>(`/api/v1/reviews?${params.toString()}`);
      setQueue((current) => cursor === undefined ? response.items : [...current, ...response.items]);
      setNextCursor(response.nextCursor);
      setMessage(response.items.length === 0 ? "Aucun dossier en revue." : "");
    } catch {
      setMessage("Impossible de charger la file de revue.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startReview(item: ReviewQueueResponse["items"][number]) {
    setMessage("Demarrage de la revue...");
    try {
      await postJson<ProjectResponse>(`/api/v1/projects/${item.projectId}/review/start`, {
        tenantId,
        approvalRequestId: item.approvalRequestId,
        expectedVersion: item.projectVersion
      });
      setMessage("Revue demarree.");
      await load();
    } catch {
      setMessage("Demarrage refuse.");
    }
  }

  async function decide(item: ReviewQueueResponse["items"][number], action: "approve" | "request-changes" | "reject", formData: FormData) {
    setMessage("Decision en cours...");
    try {
      await postJson<ProjectResponse>(`/api/v1/projects/${item.projectId}/review/${action}`, {
        tenantId,
        approvalRequestId: item.approvalRequestId,
        expectedVersion: item.projectVersion,
        ...(action !== "approve" && { reason: requiredFormString(formData, "reason") }),
        ...(action === "approve" && { reason: emptyToNull(formData.get("reason")) })
      });
      setMessage("Decision enregistree.");
      await load();
    } catch {
      setMessage("Decision refusee.");
    }
  }

  async function comment(item: ReviewQueueResponse["items"][number], formData: FormData) {
    setMessage("Ajout du commentaire...");
    try {
      await postJson(`/api/v1/projects/${item.projectId}/comments`, {
        tenantId,
        approvalRequestId: item.approvalRequestId,
        kind: requiredFormString(formData, "kind"),
        fieldKey: emptyToNull(formData.get("fieldKey")),
        body: requiredFormString(formData, "body")
      });
      setMessage("Commentaire ajoute.");
    } catch {
      setMessage("Commentaire refuse.");
    }
  }

  return (
    <section className="panel project-console">
      <p className="eyebrow">Revue regionale</p>
      <h1>Dossiers a examiner</h1>
      {message.length > 0 ? <p role="status">{message}</p> : null}
      <div className="project-list">
        {queue.map((item) => (
          <article className="project-card" key={item.approvalRequestId}>
            <h2><a href={`/app/projects/${item.projectId}/overview?tenantId=${tenantId}`}>{item.title}</a></h2>
            <dl>
              <div><dt>Code</dt><dd>{item.code}</dd></div>
              <div><dt>Organisation</dt><dd>{item.ownerOrganization.name}</dd></div>
              <div><dt>Statut</dt><dd>{item.projectStatus}</dd></div>
              <div><dt>Soumis le</dt><dd>{item.requestedAt}</dd></div>
            </dl>
            {item.projectStatus === "READY_FOR_REVIEW" ? (
              <button type="button" onClick={() => { void startReview(item); }}>Commencer la revue</button>
            ) : null}
            {item.projectStatus === "IN_REVIEW" ? (
              <>
                <form className="project-form" action={(data) => comment(item, data)}>
                  <label htmlFor={`kind-${item.approvalRequestId}`}>Type de commentaire</label>
                  <select id={`kind-${item.approvalRequestId}`} name="kind">
                    <option value="GLOBAL">Global</option>
                    <option value="FIELD">Champ</option>
                  </select>
                  <label htmlFor={`field-${item.approvalRequestId}`}>Champ</label>
                  <select id={`field-${item.approvalRequestId}`} name="fieldKey">
                    <option value="">Aucun</option>
                    <option value="problemStatement">Probleme observe</option>
                    <option value="diagnostic">Diagnostic</option>
                    <option value="summary">Resume</option>
                  </select>
                  <label htmlFor={`comment-${item.approvalRequestId}`}>Commentaire</label>
                  <textarea id={`comment-${item.approvalRequestId}`} name="body" required maxLength={4000} />
                  <button type="submit">Ajouter le commentaire</button>
                </form>
                <form className="project-form" action={(data) => decide(item, "request-changes", data)}>
                  <label htmlFor={`changes-${item.approvalRequestId}`}>Motif des corrections</label>
                  <textarea id={`changes-${item.approvalRequestId}`} name="reason" required maxLength={4000} />
                  <button type="submit">Demander modifications</button>
                </form>
                <form className="project-form" action={(data) => decide(item, "approve", data)}>
                  <label htmlFor={`approve-${item.approvalRequestId}`}>Note optionnelle</label>
                  <textarea id={`approve-${item.approvalRequestId}`} name="reason" maxLength={4000} />
                  <button type="submit">Approuver pour execution</button>
                </form>
                <form className="project-form" action={(data) => decide(item, "reject", data)}>
                  <label htmlFor={`reject-${item.approvalRequestId}`}>Motif du rejet</label>
                  <textarea id={`reject-${item.approvalRequestId}`} name="reason" required maxLength={4000} />
                  <button type="submit">Rejeter</button>
                </form>
              </>
            ) : null}
          </article>
        ))}
      </div>
      {nextCursor !== null ? (
        <button type="button" onClick={() => { void load(nextCursor); }}>Charger plus</button>
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

function statusMessage(status: ProjectResponse["status"]): string | null {
  switch (status) {
    case "READY_FOR_REVIEW":
      return "En attente de revue regionale.";
    case "IN_REVIEW":
      return "Revue regionale en cours.";
    case "CHANGES_REQUESTED":
      return "Modifications demandees.";
    case "APPROVED_FOR_EXECUTION":
      return "Approuve pour execution.";
    case "REJECTED":
      return "Projet rejete.";
    default:
      return null;
  }
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
