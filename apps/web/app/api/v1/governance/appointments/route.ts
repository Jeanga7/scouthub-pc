import {
  proposeAppointmentRequestSchema,
  tenantQuerySchema,
} from "@scouthub/contracts";
import { ApplicationError } from "@scouthub/application";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { requireActor } from "@/identity/http";
import {
  assertCanPropose,
  canReadScope,
  mapAppointment,
} from "@/governance/http";
import {
  createAppointmentUseCases,
  createPositionUseCases,
} from "@/governance/service";
import { createOrganizationUseCases } from "@/organizations/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const { tenantId } = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const organizations = createOrganizationUseCases();
    const visible = [];
    for (const item of await createAppointmentUseCases().listAppointmentViews(
      tenantId,
    )) {
      const scope = await organizations.getOrganization(
        tenantId,
        item.scopeOrgId,
      );
      if (canReadScope(actor, scope)) visible.push(mapAppointment(item));
    }
    return jsonResponse(visible, rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const payload = proposeAppointmentRequestSchema.parse(await request.json());
    const [position, scope] = await Promise.all([
      createPositionUseCases().getPosition(
        payload.tenantId,
        payload.positionId,
      ),
      createOrganizationUseCases().getOrganization(
        payload.tenantId,
        payload.scopeOrgId,
      ),
    ]);
    if (!position)
      throw new ApplicationError(
        "Position introuvable.",
        "POSITION_NOT_FOUND",
        404,
      );
    assertCanPropose(actor, position, scope);
    const now = new Date();
    const value = await createAppointmentUseCases().proposeAppointment({
      id: crypto.randomUUID(),
      tenantId: payload.tenantId,
      personId: payload.personId,
      positionId: payload.positionId,
      scopeOrgId: payload.scopeOrgId,
      status: "PENDING",
      startsAt: new Date(payload.startsAt),
      endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
      proposedBy: actor.account.id,
      validatedBy: null,
      proposedAt: now,
      validatedAt: null,
      endedAt: null,
      notes: payload.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return jsonResponse(mapAppointment(value), rid, { status: 201 });
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
