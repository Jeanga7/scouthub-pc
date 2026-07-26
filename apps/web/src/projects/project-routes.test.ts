import { describe, expect, it, vi } from "vitest";
import type { ActorContext, EvidenceDetails, EvidenceUseCases, ProjectDetails, ProjectUseCases } from "@scouthub/application";
import { ConflictError, NotFoundError, ValidationError } from "@scouthub/application";
import type { ProjectResponse } from "@scouthub/contracts";

vi.mock("@/identity/http", () => ({
  requireActor: vi.fn()
}));

vi.mock("@/projects/service", () => ({
  createProjectUseCases: vi.fn()
}));

vi.mock("@/evidence/service", () => ({
  createEvidenceUseCases: vi.fn()
}));

import { requireActor } from "@/identity/http";
import { createEvidenceUseCases } from "@/evidence/service";
import { createProjectUseCases } from "@/projects/service";
import { GET, POST } from "../../app/api/v1/projects/route";
import {
  GET as GET_PROJECT,
  PATCH
} from "../../app/api/v1/projects/[id]/route";
import { POST as SUBMIT_PROJECT } from "../../app/api/v1/projects/[id]/submit/route";
import { POST as START_REVIEW } from "../../app/api/v1/projects/[id]/review/start/route";
import { POST as REQUEST_CHANGES } from "../../app/api/v1/projects/[id]/review/request-changes/route";
import { POST as APPROVE_PROJECT } from "../../app/api/v1/projects/[id]/review/approve/route";
import { POST as REJECT_PROJECT } from "../../app/api/v1/projects/[id]/review/reject/route";
import { POST as ADD_COMMENT } from "../../app/api/v1/projects/[id]/comments/route";
import { GET as GET_REVIEW_HISTORY } from "../../app/api/v1/projects/[id]/reviews/route";
import { GET as GET_REVIEWS } from "../../app/api/v1/reviews/route";
import { POST as INITIATE_EVIDENCE_UPLOAD } from "../../app/api/v1/projects/[id]/evidence/upload-url/route";
import { GET as LIST_EVIDENCE } from "../../app/api/v1/projects/[id]/evidence/route";
import { POST as CREATE_EVIDENCE_DOWNLOAD_URL } from "../../app/api/v1/projects/[id]/evidence/[evidenceId]/download-url/route";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const projectId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const evidenceId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
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
      getProjectCapabilities: vi.fn().mockReturnValue(projectCapabilities({ canUpdate: false }))
    });

    const response = await GET_PROJECT(
      new Request(`http://localhost/api/v1/projects/${projectId}?tenantId=${tenantId}`),
      params(projectId)
    );
    const body = await response.json() as { readonly data: ProjectResponse };

    expect(response.status).toBe(200);
    expect(body.data.capabilities).toEqual(projectCapabilities({ canUpdate: false }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("submits a project for regional review with request_id and no-store", async () => {
    mockActor();
    mockUseCases({
      submitProjectForReview: vi.fn().mockResolvedValue({
        project: projectDetails({ status: "READY_FOR_REVIEW", version: 2 }),
        approvalRequest: approvalRequest()
      }),
      getProjectCapabilities: vi.fn().mockReturnValue(projectCapabilities({ canSubmit: false }))
    });

    const response = await SUBMIT_PROJECT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/submit`, {
      tenantId,
      expectedVersion: 1
    }), params(projectId));
    const body = await response.json() as {
      readonly data: { readonly project: ProjectResponse };
      readonly request_id: string;
    };

    expect(response.status).toBe(200);
    expect(body.data.project.status).toBe("READY_FOR_REVIEW");
    expect(body.request_id).toHaveLength(36);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("maps workflow authorization, self-review and stale version failures", async () => {
    mockActor();
    mockUseCases({
      startProjectReview: vi.fn().mockRejectedValue(
        new ValidationError("Project authors cannot review their own submission.", "PROJECT_SELF_REVIEW_FORBIDDEN", 403)
      )
    });
    const selfReview = await START_REVIEW(jsonRequest(`http://localhost/api/v1/projects/${projectId}/review/start`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      expectedVersion: 2
    }), params(projectId));
    expect(selfReview.status).toBe(403);
    expect((await problem(selfReview)).title).toBe("PROJECT_SELF_REVIEW_FORBIDDEN");

    mockUseCases({
      startProjectReview: vi.fn().mockRejectedValue(
        new ConflictError("Project was modified by another request.")
      )
    });
    const stale = await START_REVIEW(jsonRequest(`http://localhost/api/v1/projects/${projectId}/review/start`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      expectedVersion: 1
    }), params(projectId));
    expect(stale.status).toBe(409);
  });

  it("rejects request-changes without a reason at the HTTP contract boundary", async () => {
    mockActor();
    mockUseCases({});

    const response = await REQUEST_CHANGES(jsonRequest(`http://localhost/api/v1/projects/${projectId}/review/request-changes`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      expectedVersion: 3
    }), params(projectId));

    expect(response.status).toBe(400);
    expect((await problem(response)).request_id).toHaveLength(36);
  });

  it("handles approve and reject route outcomes", async () => {
    mockActor();
    mockUseCases({
      approveProjectForExecution: vi.fn().mockResolvedValue(projectDetails({ status: "APPROVED_FOR_EXECUTION", version: 4 }))
    });
    const approved = await APPROVE_PROJECT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/review/approve`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      expectedVersion: 3
    }), params(projectId));
    expect(approved.status).toBe(200);
    expect((await approved.json() as { readonly data: ProjectResponse }).data.status).toBe("APPROVED_FOR_EXECUTION");

    mockUseCases({
      approveProjectForExecution: vi.fn().mockRejectedValue(new ConflictError("Project was modified by another request."))
    });
    const stale = await APPROVE_PROJECT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/review/approve`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      expectedVersion: 2
    }), params(projectId));
    expect(stale.status).toBe(409);

    mockUseCases({
      approveProjectForExecution: vi.fn().mockRejectedValue(
        new ValidationError("Permission denied.", "NO_MATCHING_ACTIVE_ASSIGNMENT", 403)
      )
    });
    const denied = await APPROVE_PROJECT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/review/approve`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      expectedVersion: 3
    }), params(projectId));
    expect(denied.status).toBe(403);

    mockUseCases({});
    const missingReason = await REJECT_PROJECT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/review/reject`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      expectedVersion: 3
    }), params(projectId));
    expect(missingReason.status).toBe(400);

    mockUseCases({
      rejectProject: vi.fn().mockResolvedValue(projectDetails({ status: "REJECTED", version: 4 }))
    });
    const rejected = await REJECT_PROJECT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/review/reject`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      expectedVersion: 3,
      reason: "Projet hors cadre."
    }), params(projectId));
    expect(rejected.status).toBe(200);
    expect((await rejected.json() as { readonly data: ProjectResponse }).data.status).toBe("REJECTED");
  });

  it("validates comment route contracts", async () => {
    mockActor();
    const addProjectComment = vi.fn().mockResolvedValue({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
      tenantId,
      projectId,
      approvalRequestId: reviewRequestId,
      authorAccountId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      kind: "GLOBAL",
      fieldKey: null,
      body: "Commentaire",
      createdAt: now
    });
    mockUseCases({ addProjectComment });

    const global = await ADD_COMMENT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/comments`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      kind: "GLOBAL",
      body: "Commentaire global"
    }), params(projectId));
    expect(global.status).toBe(201);

    const field = await ADD_COMMENT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/comments`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      kind: "FIELD",
      fieldKey: "diagnostic",
      body: "Commentaire champ"
    }), params(projectId));
    expect(field.status).toBe(201);

    const invalidField = await ADD_COMMENT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/comments`, {
      tenantId,
      approvalRequestId: reviewRequestId,
      kind: "FIELD",
      fieldKey: "secretColumn",
      body: "Commentaire champ"
    }), params(projectId));
    expect(invalidField.status).toBe(400);

    mockUseCases({
      addProjectComment: vi.fn().mockRejectedValue(
        new NotFoundError("Review cycle not found.")
      )
    });
    const wrongRequest = await ADD_COMMENT(jsonRequest(`http://localhost/api/v1/projects/${projectId}/comments`, {
      tenantId,
      approvalRequestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9",
      kind: "GLOBAL",
      body: "Mauvais cycle"
    }), params(projectId));
    expect(wrongRequest.status).toBe(404);
  });

  it("returns review history with no-store and request_id", async () => {
    mockActor();
    mockUseCases({
      getProjectReviewHistory: vi.fn().mockResolvedValue({
        requests: [approvalRequest()],
        decisions: [],
        comments: [],
        transitions: []
      })
    });

    const response = await GET_REVIEW_HISTORY(
      new Request(`http://localhost/api/v1/projects/${projectId}/reviews?tenantId=${tenantId}`),
      params(projectId)
    );
    const body = await response.json() as {
      readonly data: { readonly cycles: readonly unknown[] };
      readonly request_id: string;
    };

    expect(response.status).toBe(200);
    expect(body.data.cycles).toHaveLength(1);
    expect(body.request_id).toHaveLength(36);
    expect(response.headers.get("cache-control")).toBe("no-store");

    mockUseCases({
      getProjectReviewHistory: vi.fn().mockRejectedValue(
        new ValidationError("Permission denied.", "NO_MATCHING_ACTIVE_ASSIGNMENT", 403)
      )
    });
    const denied = await GET_REVIEW_HISTORY(
      new Request(`http://localhost/api/v1/projects/${projectId}/reviews?tenantId=${tenantId}`),
      params(projectId)
    );
    expect(denied.status).toBe(403);
  });

  it("defaults the review queue to active pending requests at the HTTP boundary", async () => {
    mockActor();
    const listRegionalReviewQueue = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    mockUseCases({ listRegionalReviewQueue });

    const response = await GET_REVIEWS(new Request(`http://localhost/api/v1/reviews?tenantId=${tenantId}`));

    expect(response.status).toBe(200);
    expect(listRegionalReviewQueue).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      status: "PENDING"
    }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects invalid review queue cursors", async () => {
    mockActor();
    mockUseCases({});

    const response = await GET_REVIEWS(
      new Request(`http://localhost/api/v1/reviews?tenantId=${tenantId}&cursor=${encodeURIComponent("not-a-cursor")}`)
    );
    const body = await problem(response);

    expect(response.status).toBe(400);
    expect(body.title).toBe("PROJECT_REVIEW_CURSOR_INVALID");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 401 for anonymous Evidence upload initiation", async () => {
    mockAnonymous();
    mockEvidenceUseCases({});

    const response = await INITIATE_EVIDENCE_UPLOAD(jsonRequest(`http://localhost/api/v1/projects/${projectId}/evidence/upload-url`, {
      tenantId,
      filename: "photo.jpg",
      mime: "image/jpeg",
      bytes: 128,
      sha256: "a".repeat(64)
    }), params(projectId));

    expect(response.status).toBe(401);
  });

  it("rejects forbidden Evidence upload MIME at HTTP boundary", async () => {
    mockActor();
    mockEvidenceUseCases({});

    const response = await INITIATE_EVIDENCE_UPLOAD(jsonRequest(`http://localhost/api/v1/projects/${projectId}/evidence/upload-url`, {
      tenantId,
      filename: "evil.svg",
      mime: "image/svg+xml",
      bytes: 128,
      sha256: "a".repeat(64)
    }), params(projectId));

    expect(response.status).toBe(400);
    expect((await problem(response)).request_id).toHaveLength(36);
  });

  it("rejects invalid Evidence cursor before repository access", async () => {
    mockActor();
    mockEvidenceUseCases({});

    const response = await LIST_EVIDENCE(
      new Request(`http://localhost/api/v1/projects/${projectId}/evidence?tenantId=${tenantId}&cursor=not-a-cursor`),
      params(projectId)
    );

    expect(response.status).toBe(400);
    expect((await problem(response)).title).toBe("EVIDENCE_CURSOR_INVALID");
  });

  it("issues Evidence download URLs with no-store response", async () => {
    mockActor();
    mockEvidenceUseCases({
      createDownloadUrl: vi.fn().mockResolvedValue({
        url: "https://storage.test/download?X-Amz-Expires=120",
        expiresAt: now
      })
    });

    const response = await CREATE_EVIDENCE_DOWNLOAD_URL(jsonRequest(
      `http://localhost/api/v1/projects/${projectId}/evidence/${evidenceId}/download-url`,
      { tenantId }
    ), evidenceParams(projectId, evidenceId));
    const body = await response.json() as { readonly data: { readonly url: string }; readonly request_id: string };

    expect(response.status).toBe(200);
    expect(body.data.url).toContain("X-Amz-Expires=120");
    expect(body.request_id).toHaveLength(36);
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
    getProjectCapabilities: vi.fn().mockReturnValue(projectCapabilities({ canUpdate: true })),
    updateProjectDraft: vi.fn().mockResolvedValue(projectDetails()),
    listProjectOwnerOptions: vi.fn().mockResolvedValue([]),
    submitProjectForReview: vi.fn().mockResolvedValue({
      project: projectDetails({ status: "READY_FOR_REVIEW", version: 2 }),
      approvalRequest: approvalRequest()
    }),
    startProjectReview: vi.fn().mockResolvedValue(projectDetails({ status: "IN_REVIEW", version: 3 })),
    requestProjectChanges: vi.fn().mockResolvedValue(projectDetails({ status: "CHANGES_REQUESTED", version: 4 })),
    approveProjectForExecution: vi.fn().mockResolvedValue(projectDetails({ status: "APPROVED_FOR_EXECUTION", version: 4 })),
    rejectProject: vi.fn().mockResolvedValue(projectDetails({ status: "REJECTED", version: 4 })),
    addProjectComment: vi.fn().mockResolvedValue({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
      tenantId,
      projectId,
      approvalRequestId: reviewRequestId,
      authorAccountId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      kind: "GLOBAL",
      fieldKey: null,
      body: "Commentaire",
      createdAt: now
    }),
    listRegionalReviewQueue: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getProjectReviewHistory: vi.fn().mockResolvedValue({
      requests: [],
      decisions: [],
      comments: [],
      transitions: []
    }),
    ...overrides
  } as ProjectUseCases);
}

function mockEvidenceUseCases(overrides: Partial<EvidenceUseCases>): void {
  vi.mocked(createEvidenceUseCases).mockReturnValue({
    initiateEvidenceUpload: vi.fn().mockResolvedValue({
      asset: evidenceDetails().media,
      upload: {
        url: "https://storage.test/upload?X-Amz-Expires=300",
        method: "PUT",
        expiresAt: now,
        requiredHeaders: {
          "Content-Type": "image/jpeg",
          "x-amz-checksum-sha256": "checksum"
        }
      }
    }),
    confirmEvidenceUpload: vi.fn().mockResolvedValue(evidenceDetails()),
    listEvidence: vi.fn().mockResolvedValue({ items: [evidenceDetails()], nextCursor: null }),
    createDownloadUrl: vi.fn().mockResolvedValue({
      url: "https://storage.test/download?X-Amz-Expires=120",
      expiresAt: now
    }),
    ...overrides
  } as EvidenceUseCases);
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

function projectDetails(overrides: Partial<ProjectDetails["project"]> = {}): ProjectDetails {
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
      updatedAt: now,
      ...overrides
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
      displayName: "Awa Test",
      status: "ACTIVE"
    }
  };
}

function evidenceDetails(): EvidenceDetails {
  return {
    evidence: {
      id: evidenceId,
      tenantId,
      projectId,
      mediaAssetId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
      type: "PHOTO",
      title: "Photo synthetique",
      description: null,
      occurredAt: null,
      visibility: "PRIVATE",
      validationStatus: "UNREVIEWED",
      createdByAccountId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      createdAt: now,
      updatedAt: now
    },
    media: {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
      tenantId,
      projectId,
      temporaryObjectKey: null,
      objectKey: "evidence/tenant/asset/random",
      mime: "image/jpeg",
      byteSize: 128,
      sha256: "a".repeat(64),
      etag: "\"etag\"",
      classification: "P3",
      uploadStatus: "VERIFIED",
      scanStatus: "NOT_SCANNED",
      uploadedByAccountId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      uploadExpiresAt: now,
      verifiedAt: now,
      rejectedAt: null,
      rejectionCode: null,
      width: null,
      height: null,
      createdAt: now,
      updatedAt: now
    },
    project: {
      projectId,
      tenantId,
      status: "DRAFT",
      createdByAccountId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      ownerOrganizationId: ownerGroupId,
      ownerOrganizationPath: `/${tenantId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/${ownerGroupId}/`,
      ownerOrganizationType: "GROUP",
      ownerOrganizationStatus: "ACTIVE"
    }
  };
}

const reviewRequestId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";

function approvalRequest() {
  return {
    id: reviewRequestId,
    tenantId,
    projectId,
    status: "PENDING" as const,
    submittedProjectVersion: 1,
    requestedByAccountId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    requestedAt: now,
    resolvedAt: null
  };
}

function projectCapabilities(overrides: Partial<NonNullable<ProjectResponse["capabilities"]>> = {}): NonNullable<ProjectResponse["capabilities"]> {
  return {
    canUpdate: true,
    canSubmit: false,
    canStartReview: false,
    canComment: false,
    canRequestChanges: false,
    canApprove: false,
    canReject: false,
    ...overrides
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

function evidenceParams(
  id: string,
  currentEvidenceId: string
): { readonly params: Promise<{ readonly id: string; readonly evidenceId: string }> } {
  return { params: Promise.resolve({ id, evidenceId: currentEvidenceId }) };
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
