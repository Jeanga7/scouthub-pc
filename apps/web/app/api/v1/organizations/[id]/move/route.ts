import { moveOrganizationRequestSchema, uuidSchema } from "@scouthub/contracts";
import {
  assertDevAdmin,
  handleRouteError,
  jsonResponse,
  mapOrganization,
  requestId
} from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = assertDevAdmin(request);
  if (blocked !== null) {
    return blocked;
  }

  const id = requestId(request);
  try {
    const params = await context.params;
    const organizationId = uuidSchema.parse(params.id);
    const payload = moveOrganizationRequestSchema.parse(await request.json());
    const organizationUseCases = await createOrganizationUseCases();
    const organization = await organizationUseCases.moveOrganization({
      ...payload,
      organizationId,
      requestId: id
    });
    return jsonResponse(mapOrganization(organization), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
