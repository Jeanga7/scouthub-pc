import { moveOrganizationRequestSchema, uuidSchema } from "@scouthub/contracts";
import {
  authorizeOrganization,
  handleRouteError,
  jsonResponse,
  mapOrganization,
  requestId
} from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const params = await context.params;
    const organizationId = uuidSchema.parse(params.id);
    const payload = moveOrganizationRequestSchema.parse(await request.json());
    const organizationUseCases = createOrganizationUseCases();
    const current = await organizationUseCases.getOrganization(
      payload.tenantId,
      organizationId
    );
    const newParent = await organizationUseCases.getOrganization(
      payload.tenantId,
      payload.newParentId
    );
    const actor = await authorizeOrganization({
      request,
      requestId: id,
      action: "organization.move",
      organization: current
    });
    await authorizeOrganization({
      request,
      requestId: id,
      action: "organization.move",
      organization: newParent
    });
    const organization = await organizationUseCases.moveOrganization({
      ...payload,
      organizationId,
      requestId: id,
      auditActor: { kind: "USER", id: actor.account.id }
    });
    return jsonResponse(mapOrganization(organization), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
