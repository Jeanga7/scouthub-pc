import { uuidSchema, versionedOrganizationRequestSchema } from "@scouthub/contracts";
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
    const payload = versionedOrganizationRequestSchema.parse(await request.json());
    const organizationUseCases = createOrganizationUseCases();
    const current = await organizationUseCases.getOrganization(
      payload.tenantId,
      organizationId
    );
    await authorizeOrganization({
      request,
      requestId: id,
      action: "organization.activate",
      organization: current
    });
    const organization = await organizationUseCases.activateOrganization({
      ...payload,
      organizationId,
      requestId: id
    });
    return jsonResponse(mapOrganization(organization), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
