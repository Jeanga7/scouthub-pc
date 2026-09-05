import {
  appointmentDecisionRequestSchema,
  tenantQuerySchema,
  uuidSchema,
} from "@scouthub/contracts";
import { ApplicationError } from "@scouthub/application";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { requireActor } from "@/identity/http";
import { assertCanValidate, mapAppointment } from "@/governance/http";
import { createAppointmentUseCases } from "@/governance/service";
import { createOrganizationUseCases } from "@/organizations/service";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const { tenantId } = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    appointmentDecisionRequestSchema.parse(await request.json());
    const useCases = createAppointmentUseCases();
    const appointment = await useCases.getAppointment(
      tenantId,
      uuidSchema.parse((await context.params).id),
    );
    if (!appointment)
      throw new ApplicationError(
        "Nomination introuvable.",
        "APPOINTMENT_NOT_FOUND",
        404,
      );
    assertCanValidate(
      actor,
      appointment,
      await createOrganizationUseCases().getOrganization(
        tenantId,
        appointment.scopeOrgId,
      ),
    );
    return jsonResponse(
      mapAppointment(
        await useCases.rejectAppointment(tenantId, appointment.id),
      ),
      rid,
    );
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
