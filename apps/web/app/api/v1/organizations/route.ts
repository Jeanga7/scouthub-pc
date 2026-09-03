import { createOrganizationRequestSchema } from "@scouthub/contracts";
import { ApplicationError } from "@scouthub/application";
import {
  authorizeOrganization,
  handleRouteError,
  jsonResponse,
  mapOrganization,
  requestId
} from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const payload = createOrganizationRequestSchema.parse(await request.json());
    const organizationUseCases = createOrganizationUseCases();
    const parent = await organizationUseCases.getOrganization(
      payload.tenantId,
      payload.parentId
    );
    const actor = await authorizeOrganization({
      request,
      requestId: id,
      action: "organization.create",
      organization: parent
    });
    if (!actor.assignments.some((assignment) => assignment.tenantId === payload.tenantId && assignment.permissions.includes("organization.create"))) {
      throw new ApplicationError("Permission denied.", "AUTHZ_DENIED", 403);
    }
    const organization = await organizationUseCases.createOrganization({
      ...payload,
      activeFrom: payload.activeFrom === undefined || payload.activeFrom === null ? null : new Date(payload.activeFrom),
      activeUntil: payload.activeUntil === undefined || payload.activeUntil === null ? null : new Date(payload.activeUntil),
      requestId: id,
      auditActor: { kind: "USER", id: actor.account.id }
    });
    return jsonResponse(mapOrganization(organization), id, { status: 201 });
  } catch (error) {
    return handleRouteError(error, id);
  }
}
