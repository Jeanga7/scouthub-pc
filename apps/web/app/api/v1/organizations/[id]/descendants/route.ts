import { tenantQuerySchema, uuidSchema } from "@scouthub/contracts";
import {
  assertDevAdmin,
  handleRouteError,
  jsonResponse,
  mapOrganization,
  requestId
} from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = assertDevAdmin(request);
  if (blocked !== null) {
    return blocked;
  }

  const id = requestId(request);
  try {
    const params = await context.params;
    const organizationId = uuidSchema.parse(params.id);
    const query = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    const organizationUseCases = await createOrganizationUseCases();
    const organizations = await organizationUseCases.listDescendants(
      query.tenantId,
      organizationId
    );
    return jsonResponse(organizations.map(mapOrganization), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
