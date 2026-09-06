import {
  tenantQuerySchema,
  updatePositionRequestSchema,
  uuidSchema,
} from "@scouthub/contracts";
import { ApplicationError } from "@scouthub/application";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { requireActor } from "@/identity/http";
import { assertTenantPermission, mapPosition } from "@/governance/http";
import { createPositionUseCases } from "@/governance/service";
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
    assertTenantPermission(actor, tenantId, "position.read");
    const value = await createPositionUseCases().getPosition(
      tenantId,
      uuidSchema.parse((await context.params).id),
    );
    if (!value)
      throw new ApplicationError(
        "Position introuvable.",
        "POSITION_NOT_FOUND",
        404,
      );
    return jsonResponse(mapPosition(value), rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const { tenantId } = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const payload = updatePositionRequestSchema.parse(await request.json());
    assertTenantPermission(actor, tenantId, "position.manage");
    const value = await createPositionUseCases().updatePosition(
      tenantId,
      uuidSchema.parse((await context.params).id),
      payload,
    );
    if (!value)
      throw new ApplicationError(
        "Position introuvable.",
        "POSITION_NOT_FOUND",
        404,
      );
    return jsonResponse(mapPosition(value), rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
