import type {
  ActorContext,
  ProjectDetails,
  ProjectUseCases
} from "@scouthub/application";
import { ValidationError } from "@scouthub/application";
import {
  uuidSchema,
  projectListResponseSchema,
  projectOwnerOptionSchema,
  projectResponseSchema,
  type CreateProjectDraftRequest,
  type ProjectListResponse,
  type ProjectResponse,
  type UpdateProjectDraftRequest
} from "@scouthub/contracts";
import { z } from "zod";
import { requireActor } from "@/identity/http";
import { handleRouteError, jsonResponse, requestId } from "@/organizations/http";

export { handleRouteError, jsonResponse, requestId };

export async function requireProjectActor(
  request: Request,
  currentRequestId: string
): Promise<ActorContext> {
  return requireActor(request, currentRequestId);
}

const projectCursorSchema = z.object({
  updatedAt: z.iso.datetime(),
  id: uuidSchema
}).strict();

export function mapProject(
  details: ProjectDetails,
  capabilities?: { readonly canUpdate: boolean }
): ProjectResponse {
  return projectResponseSchema.parse({
    id: details.project.id,
    tenantId: details.project.tenantId,
    ownerOrganization: {
      id: details.owner.organizationId,
      name: details.owner.name,
      type: details.owner.type
    },
    code: details.project.code,
    internalSlug: details.project.internalSlug,
    title: details.project.title,
    summary: details.project.summary,
    problemStatement: details.project.problemStatement,
    diagnostic: details.project.diagnostic,
    projectMode: details.project.projectMode,
    status: details.project.status,
    visibility: details.project.visibility,
    locationLabel: details.project.locationLabel,
    plannedStartAt: details.project.plannedStartAt?.toISOString() ?? null,
    plannedEndAt: details.project.plannedEndAt?.toISOString() ?? null,
    actualStartAt: details.project.actualStartAt?.toISOString() ?? null,
    actualEndAt: details.project.actualEndAt?.toISOString() ?? null,
    projectLead: {
      id: details.projectLead.id,
      displayName: details.projectLead.displayName
    },
    ...(capabilities !== undefined && { capabilities }),
    version: details.project.version,
    createdAt: details.project.createdAt.toISOString(),
    updatedAt: details.project.updatedAt.toISOString()
  });
}

export function mapProjectList(input: {
  readonly projects: readonly ProjectDetails[];
  readonly nextCursor: string | null;
}): ProjectListResponse {
  return projectListResponseSchema.parse({
    projects: input.projects.map((project) => mapProject(project)),
    nextCursor: input.nextCursor
  });
}

type CreateProjectDraftUseCaseInput = Parameters<
  ProjectUseCases["createProjectDraft"]
>[0];

type UpdateProjectDraftUseCaseInput = Parameters<
  ProjectUseCases["updateProjectDraft"]
>[0];

export function mapCreateProjectRequest(input: {
  readonly actor: ActorContext;
  readonly payload: CreateProjectDraftRequest;
  readonly requestId: string;
}): CreateProjectDraftUseCaseInput {
  const { payload } = input;
  return {
    actor: input.actor,
    tenantId: payload.tenantId,
    ownerOrganizationId: payload.ownerOrganizationId,
    title: payload.title,
    requestId: input.requestId,
    ...(payload.projectMode !== undefined && { projectMode: payload.projectMode }),
    ...(payload.visibility !== undefined && { visibility: payload.visibility }),
    ...(payload.summary !== undefined && { summary: payload.summary }),
    ...(payload.problemStatement !== undefined && { problemStatement: payload.problemStatement }),
    ...(payload.diagnostic !== undefined && { diagnostic: payload.diagnostic }),
    ...(payload.locationLabel !== undefined && { locationLabel: payload.locationLabel }),
    ...(payload.plannedStartAt !== undefined && {
      plannedStartAt: payload.plannedStartAt === null ? null : new Date(payload.plannedStartAt)
    }),
    ...(payload.plannedEndAt !== undefined && {
      plannedEndAt: payload.plannedEndAt === null ? null : new Date(payload.plannedEndAt)
    }),
    ...(payload.actualStartAt !== undefined && {
      actualStartAt: payload.actualStartAt === null ? null : new Date(payload.actualStartAt)
    }),
    ...(payload.actualEndAt !== undefined && {
      actualEndAt: payload.actualEndAt === null ? null : new Date(payload.actualEndAt)
    })
  };
}

export function mapUpdateProjectRequest(input: {
  readonly actor: ActorContext;
  readonly payload: UpdateProjectDraftRequest;
  readonly projectId: string;
  readonly requestId: string;
}): UpdateProjectDraftUseCaseInput {
  const { payload } = input;
  return {
    actor: input.actor,
    tenantId: payload.tenantId,
    projectId: input.projectId,
    expectedVersion: payload.expectedVersion,
    requestId: input.requestId,
    ...(payload.title !== undefined && { title: payload.title }),
    ...(payload.summary !== undefined && { summary: payload.summary }),
    ...(payload.problemStatement !== undefined && { problemStatement: payload.problemStatement }),
    ...(payload.diagnostic !== undefined && { diagnostic: payload.diagnostic }),
    ...(payload.projectMode !== undefined && { projectMode: payload.projectMode }),
    ...(payload.visibility !== undefined && { visibility: payload.visibility }),
    ...(payload.locationLabel !== undefined && { locationLabel: payload.locationLabel }),
    ...(payload.plannedStartAt !== undefined && {
      plannedStartAt: payload.plannedStartAt === null ? null : new Date(payload.plannedStartAt)
    }),
    ...(payload.plannedEndAt !== undefined && {
      plannedEndAt: payload.plannedEndAt === null ? null : new Date(payload.plannedEndAt)
    }),
    ...(payload.actualStartAt !== undefined && {
      actualStartAt: payload.actualStartAt === null ? null : new Date(payload.actualStartAt)
    }),
    ...(payload.actualEndAt !== undefined && {
      actualEndAt: payload.actualEndAt === null ? null : new Date(payload.actualEndAt)
    })
  };
}

export function encodeProjectCursor(cursor: {
  readonly updatedAt: Date;
  readonly id: string;
} | null): string | null {
  if (cursor === null) {
    return null;
  }
  return Buffer.from(JSON.stringify({
    updatedAt: cursor.updatedAt.toISOString(),
    id: cursor.id
  }), "utf8").toString("base64url");
}

export function decodeProjectCursor(value: string | undefined): {
  readonly updatedAt: Date;
  readonly id: string;
} | null {
  if (value === undefined) {
    return null;
  }
  try {
    const parsed = projectCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    );
    // The cursor is opaque pagination state, not an authorization input; it is
    // validated before hitting SQL so malformed values cannot become PG errors.
    return { updatedAt: new Date(parsed.updatedAt), id: parsed.id };
  } catch {
    throw new ValidationError("Project cursor is invalid.", "PROJECT_CURSOR_INVALID", 400);
  }
}

export function mapProjectOwnerOptions(options: readonly {
  readonly id: string;
  readonly name: string;
  readonly type: "GROUP" | "UNIT";
  readonly path: string;
}[]) {
  return options.map((option) => projectOwnerOptionSchema.parse(option));
}
