import { ApplicationError } from "@scouthub/application";
import type { ActorContext, OrganizationUseCases } from "@scouthub/application";
import { canAccessOrganization } from "@scouthub/authz";
import {
  organizationResponseSchema,
  problemDetailsSchema,
  type UpdateOrganizationRequest,
  type OrganizationResponse
} from "@scouthub/contracts";
import type { PermissionCode } from "@scouthub/domain";
import type { Organization } from "@scouthub/domain";
import { ZodError } from "zod";
import { requireActor } from "@/identity/http";

export function requestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function mapOrganization(organization: Organization): OrganizationResponse {
  return organizationResponseSchema.parse({
    id: organization.id,
    tenantId: organization.tenantId,
    parentId: organization.parentId,
    type: organization.type,
    name: organization.name,
    code: organization.code,
    status: organization.status,
    path: organization.path,
    depth: organization.depth,
    locationLabel: organization.locationLabel,
    activeFrom: organization.activeFrom?.toISOString() ?? null,
    activeUntil: organization.activeUntil?.toISOString() ?? null,
    metadata: organization.metadata,
    version: organization.version,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString()
  });
}

export async function authorizeOrganization(
  input: {
    readonly request: Request;
    readonly requestId: string;
    readonly action: PermissionCode;
    readonly organization: Organization;
  }
): Promise<ActorContext> {
  const actor = await requireActor(input.request, input.requestId);
  const decision = canAccessOrganization(
    actor,
    input.action,
    {
      tenantId: input.organization.tenantId,
      organizationId: input.organization.id,
      path: input.organization.path,
      type: input.organization.type
    },
    { now: new Date() }
  );
  if (decision.effect === "deny") {
    throw new ApplicationError("Permission denied.", "AUTHZ_DENIED", 403);
  }
  return actor;
}

type UpdateOrganizationUseCaseInput = Parameters<
  OrganizationUseCases["updateOrganization"]
>[0];

export function mapUpdateOrganizationRequest(input: {
  readonly payload: UpdateOrganizationRequest;
  readonly organizationId: string;
  readonly requestId: string;
  readonly actor?: ActorContext;
}): UpdateOrganizationUseCaseInput {
  const { payload, organizationId, requestId: currentRequestId, actor } = input;
  return {
    tenantId: payload.tenantId,
    organizationId,
    expectedVersion: payload.expectedVersion,
    requestId: currentRequestId,
    ...(actor !== undefined && {
      auditActor: { kind: "USER" as const, id: actor.account.id }
    }),
    ...(payload.name !== undefined && { name: payload.name }),
    ...(payload.code !== undefined && { code: payload.code }),
    ...(payload.locationLabel !== undefined && {
      locationLabel: payload.locationLabel
    }),
    ...(payload.activeFrom !== undefined && {
      activeFrom: payload.activeFrom === null ? null : new Date(payload.activeFrom)
    }),
    ...(payload.activeUntil !== undefined && {
      activeUntil:
        payload.activeUntil === null ? null : new Date(payload.activeUntil)
    })
  };
}

export function jsonResponse(data: unknown, request_id: string, init?: ResponseInit): Response {
  return Response.json(
    { data, request_id },
    {
      ...init,
      headers: {
        ...etagFor(data),
        ...init?.headers
      }
    }
  );
}

export function handleRouteError(error: unknown, id: string): Response {
  if (error instanceof ApplicationError) {
    return problemResponse({
      requestId: id,
      status: error.status,
      title: error.code,
      detail: error.message
    });
  }

  if (error instanceof ZodError) {
    return problemResponse({
      requestId: id,
      status: 400,
      title: "VALIDATION_ERROR",
      detail: "Request payload or parameters are invalid."
    });
  }

  return problemResponse({
    requestId: id,
    status: 500,
    title: "Internal server error",
    detail: "An unexpected error occurred."
  });
}

export function problemResponse(input: {
  readonly requestId: string;
  readonly status: number;
  readonly title: string;
  readonly detail: string;
}): Response {
  const body = problemDetailsSchema.parse({
    type: "about:blank",
    title: input.title,
    status: input.status,
    detail: input.detail,
    request_id: input.requestId
  });

  return Response.json(body, {
    status: input.status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

function etagFor(data: unknown): Record<string, string> {
  if (
    typeof data === "object" &&
    data !== null &&
    "version" in data &&
    typeof data.version === "number"
  ) {
    return { etag: `"${data.version}"` };
  }

  return {};
}
