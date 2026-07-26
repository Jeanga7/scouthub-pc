import { describe, expect, it, vi } from "vitest";
import type { ActorContext, ProjectDetails, ProjectUseCases } from "@scouthub/application";
import { ConflictError, ValidationError } from "@scouthub/application";
import type { ProjectResponse } from "@scouthub/contracts";

vi.mock("@/identity/http", () => ({
  requireActor: vi.fn()
}));

vi.mock("@/projects/service", () => ({
  createProjectUseCases: vi.fn()
}));

import { requireActor } from "@/identity/http";
import { createProjectUseCases } from "@/projects/service";
import { GET, POST } from "../../app/api/v1/projects/route";
import {
  GET as GET_PROJECT,
  PATCH
} from "../../app/api/v1/projects/[id]/route";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const projectId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const ownerGroupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const now = new Date("2026-07-25T12:00:00.000Z");

describe("project route handlers", () => {
  it("returns 401 for anonymous project requests", async () => {
    mockAnonymous();
    mockUseCases({});

    const getResponse = await GET(new Request(`http://localhost/api/v1/projects?tenantId=${tenantId}`));
    const postResponse = await POST(jsonRequest("http://localhost/api/v1/projects", {
      tenantId,
      ownerOrganizationId: ownerGroupId,
      title: "Jardin communautaire"
    }));

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
  });

  it.each([
    ["owner REGION", "PROJECT_OWNER_TYPE_INVALID"],
    ["owner DRAFT", "PROJECT_OWNER_INACTIVE"],
    ["planned dates", "PROJECT_PLANNED_DATES_INVALID"],
    ["actual dates", "PROJECT_ACTUAL_DATES_INVALID"],
    ["whitespace title", "PROJECT_TITLE_REQUIRED"]
  ])("maps project validation failure to 422: %s", async (_label, code) => {
    mockActor();
    mockUseCases({
      createProjectDraft: vi.fn().mockRejectedValue(
        new ValidationError("Project validation failed.", code, 422)
      )
    });

    const response = await POST(jsonRequest("http://localhost/api/v1/projects", {
      tenantId,
      ownerOrganizationId: ownerGroupId,
      title: "Jardin communautaire"
    }));
    const body = await problem(response);

    expect(response.status).toBe(422);
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe(code);
    expect(body.request_id).toHaveLength(36);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["PUBLIC visibility create", { tenantId, ownerOrganizationId: ownerGroupId, title: "Projet", visibility: "PUBLIC" }, "POST"],
    ["status patch", { tenantId, expectedVersion: 1, status: "READY_FOR_REVIEW" }, "PATCH"],
    ["owner patch", { tenantId, expectedVersion: 1, ownerOrganizationId: ownerGroupId }, "PATCH"],
    ["lead patch", { tenantId, expectedVersion: 1, projectLeadPersonId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2" }, "PATCH"],
    ["creator patch", { tenantId, expectedVersion: 1, createdByAccountId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1" }, "PATCH"],
    ["code patch", { tenantId, expectedVersion: 1, code: "PRJ-ABCDEF123456" }, "PATCH"],
    ["slug patch", { tenantId, expectedVersion: 1, internalSlug: "forbidden" }, "PATCH"]
  ] as const)("rejects forbidden project contract fields: %s", async (_label, payload, method) => {
    mockActor();
    mockUseCases({});

    const response = method === "POST"
      ? await POST(jsonRequest("http://localhost/api/v1/projects", payload))
      : await PATCH(jsonRequest(`http://localhost/api/v1/projects/${projectId}`, payload), params(projectId));

    expect(response.status).toBe(400);
    expect((await problem(response)).request_id).toHaveLength(36);
  });

  it.each([
    ["GroupAdmin Group B denied", "NO_MATCHING_ACTIVE_ASSIGNMENT"],
    ["UnitLeader sibling denied", "NO_MATCHING_ACTIVE_ASSIGNMENT"],
    ["RegionalReviewer update denied", "NO_MATCHING_ACTIVE_ASSIGNMENT"],
    ["RegionalAdmin update denied", "NO_MATCHING_ACTIVE_ASSIGNMENT"],
    ["PlatformAdmin read denied", "NO_MATCHING_ACTIVE_ASSIGNMENT"],
    ["tenant B denied", "NO_MATCHING_ACTIVE_ASSIGNMENT"]
  ])("maps project authorization denial to 403: %s", async (_label, reasonCode) => {
    mockActor();
    mockUseCases({
      updateProjectDraft: vi.fn().mockRejectedValue(
        new ValidationError("Permission denied.", reasonCode, 403)
      )
    });

    const response = await PATCH(jsonRequest(`http://localhost/api/v1/projects/${projectId}`, {
      tenantId,
      expectedVersion: 1,
      title: "Nouveau titre"
    }), params(projectId));

    expect(response.status).toBe(403);
  });

  it("maps stale expectedVersion to 409", async () => {
    mockActor();
    mockUseCases({
      updateProjectDraft: vi.fn().mockRejectedValue(
        new ConflictError("Project was modified by another request.")
      )
    });

    const response = await PATCH(jsonRequest(`http://localhost/api/v1/projects/${projectId}`, {
      tenantId,
      expectedVersion: 1,
      title: "Nouveau titre"
    }), params(projectId));

    expect(response.status).toBe(409);
  });

  it.each([
    ["malformed base64", "not-a-cursor"],
    ["invalid json", Buffer.from("not-json", "utf8").toString("base64url")],
    ["invalid date", encodeCursor({ updatedAt: "not-a-date", id: projectId })],
    ["invalid uuid", encodeCursor({ updatedAt: now.toISOString(), id: "not-a-uuid" })],
    ["missing id", encodeCursor({ updatedAt: now.toISOString() })]
  ])("rejects invalid project cursors: %s", async (_label, cursor) => {
    mockActor();
    mockUseCases({});

    const response = await GET(
      new Request(`http://localhost/api/v1/projects?tenantId=${tenantId}&cursor=${encodeURIComponent(cursor)}`)
    );
    const body = await problem(response);

    expect(response.status).toBe(400);
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe("PROJECT_CURSOR_INVALID");
    expect(body.detail).not.toContain("PostgreSQL");
  });

  it("returns project capabilities for read-only and editable users", async () => {
    mockActor();
    mockUseCases({
      getProject: vi.fn().mockResolvedValue(projectDetails()),
      getProjectCapabilities: vi.fn().mockReturnValue({ canUpdate: false })
    });

    const response = await GET_PROJECT(
      new Request(`http://localhost/api/v1/projects/${projectId}?tenantId=${tenantId}`),
      params(projectId)
    );
    const body = await response.json() as { readonly data: ProjectResponse };

    expect(response.status).toBe(200);
    expect(body.data.capabilities).toEqual({ canUpdate: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

function mockActor(): void {
  vi.mocked(requireActor).mockResolvedValue(actor());
}

function mockAnonymous(): void {
  vi.mocked(requireActor).mockRejectedValue(
    new ValidationError("Authentication required.", "AUTH_REQUIRED", 401)
  );
}

function mockUseCases(overrides: Partial<ProjectUseCases>): void {
  vi.mocked(createProjectUseCases).mockReturnValue({
    listProjects: vi.fn().mockResolvedValue({ projects: [], nextCursor: null }),
    createProjectDraft: vi.fn().mockResolvedValue(projectDetails()),
    getProject: vi.fn().mockResolvedValue(projectDetails()),
    getProjectCapabilities: vi.fn().mockReturnValue({ canUpdate: true }),
    updateProjectDraft: vi.fn().mockResolvedValue(projectDetails()),
    listProjectOwnerOptions: vi.fn().mockResolvedValue([]),
    ...overrides
  } as ProjectUseCases);
}

function actor(): ActorContext {
  return {
    account: {
      id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      externalIdentityId: "user_test",
      primaryEmail: "awa@example.test",
      status: "ACTIVE",
      lastLoginAt: null,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now
    },
    person: null,
    assuranceLevel: "standard",
    assignments: []
  };
}

function projectDetails(): ProjectDetails {
  return {
    project: {
      id: projectId,
      tenantId,
      ownerOrganizationId: ownerGroupId,
      code: "PRJ-DDDDDDDDDDDD",
      internalSlug: "jardin-communautaire-dddddddddddd",
      title: "Jardin communautaire",
      summary: null,
      problemStatement: null,
      diagnostic: null,
      projectMode: "PLANNED",
      status: "DRAFT",
      visibility: "PRIVATE",
      locationLabel: null,
      plannedStartAt: null,
      plannedEndAt: null,
      actualStartAt: null,
      actualEndAt: null,
      projectLeadPersonId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
      createdByAccountId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      version: 1,
      createdAt: now,
      updatedAt: now
    },
    owner: {
      tenantId,
      organizationId: ownerGroupId,
      name: "Groupe Baobab",
      type: "GROUP",
      status: "ACTIVE",
      path: `/${tenantId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/${ownerGroupId}/`
    },
    projectLead: {
      id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
      displayName: "Awa Test"
    }
  };
}

function jsonRequest(url: string, payload: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function params(id: string): { readonly params: Promise<{ readonly id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function problem(response: Response): Promise<{
  readonly type: string;
  readonly title: string;
  readonly detail: string;
  readonly request_id: string;
}> {
  return await response.json() as {
    readonly type: string;
    readonly title: string;
    readonly detail: string;
    readonly request_id: string;
  };
}

function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
