import { createTenantRootRequestSchema } from "@scouthub/contracts";
import {
  assertDevAdmin,
  handleRouteError,
  jsonResponse,
  mapOrganization,
  requestId
} from "@/organizations/http";
import { createOrganizationUseCases } from "@/organizations/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = assertDevAdmin(request);
  if (blocked !== null) {
    return blocked;
  }

  const id = requestId(request);
  try {
    const payload = createTenantRootRequestSchema.parse(await request.json());
    const organizationUseCases = createOrganizationUseCases();
    const organization = await organizationUseCases.createTenantRoot({
      ...payload,
      activeFrom: payload.activeFrom === undefined || payload.activeFrom === null ? null : new Date(payload.activeFrom),
      activeUntil: payload.activeUntil === undefined || payload.activeUntil === null ? null : new Date(payload.activeUntil),
      requestId: id
    });
    return jsonResponse(mapOrganization(organization), id, { status: 201 });
  } catch (error) {
    return handleRouteError(error, id);
  }
}
