import { tenantQuerySchema, uuidSchema } from "@scouthub/contracts";
import {
  authorizeOrganization,
  handleRouteError,
  jsonResponse,
  mapOrganization,
  requestId
} from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const params = await context.params;
    const organizationId = uuidSchema.parse(params.id);
    const query = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    const organizationUseCases = createOrganizationUseCases();
    const organization = await organizationUseCases.getOrganization(
      query.tenantId,
      organizationId
    );
    await authorizeOrganization({
      request,
      requestId: id,
      action: "organization.read",
      organization
    });
    const organizations = await organizationUseCases.listAncestors(
      query.tenantId,
      organizationId
    );
    const visible = [];
    for (const ancestor of organizations) {
      try {
        await authorizeOrganization({
          request,
          requestId: id,
          action: "organization.read",
          organization: ancestor
        });
        visible.push(ancestor);
      } catch {
        // Ancestors above the actor's scope are useful for hierarchy internally,
        // but returning them would leak organization data outside the policy scope.
      }
    }
    return jsonResponse(visible.map(mapOrganization), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
