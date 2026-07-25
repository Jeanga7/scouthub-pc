import {
  tenantQuerySchema,
  updateOrganizationRequestSchema,
  uuidSchema
} from "@scouthub/contracts";
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
    const organization = await organizationUseCases.getOrganization(
      query.tenantId,
      organizationId
    );
    return jsonResponse(mapOrganization(organization), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = assertDevAdmin(request);
  if (blocked !== null) {
    return blocked;
  }

  const id = requestId(request);
  try {
    const params = await context.params;
    const organizationId = uuidSchema.parse(params.id);
    const payload = updateOrganizationRequestSchema.parse(await request.json());
    const organizationUseCases = await createOrganizationUseCases();
    const organization = await organizationUseCases.updateOrganization({
      ...payload,
      organizationId,
      activeFrom: payload.activeFrom === undefined || payload.activeFrom === null ? null : new Date(payload.activeFrom),
      activeUntil: payload.activeUntil === undefined || payload.activeUntil === null ? null : new Date(payload.activeUntil),
      requestId: id
    });
    return jsonResponse(mapOrganization(organization), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
