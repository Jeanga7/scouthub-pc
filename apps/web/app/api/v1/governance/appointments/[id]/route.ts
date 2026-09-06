import { tenantQuerySchema, uuidSchema } from "@scouthub/contracts";
import { ApplicationError } from "@scouthub/application";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { requireActor } from "@/identity/http";
import { canReadScope, mapAppointment } from "@/governance/http";
import { createAppointmentUseCases } from "@/governance/service";
import { createOrganizationUseCases } from "@/organizations/service";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const { tenantId } = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const value = await createAppointmentUseCases().getAppointment(
      tenantId,
      uuidSchema.parse((await context.params).id),
    );
    if (!value)
      throw new ApplicationError(
        "Nomination introuvable.",
        "APPOINTMENT_NOT_FOUND",
        404,
      );
    const scope = await createOrganizationUseCases().getOrganization(
      tenantId,
      value.scopeOrgId,
    );
    if (!canReadScope(actor, scope))
      throw new ApplicationError("Permission denied.", "AUTHZ_DENIED", 403);
    return jsonResponse(mapAppointment(value), rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
