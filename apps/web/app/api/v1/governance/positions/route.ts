import {
  createPositionRequestSchema,
  tenantQuerySchema,
} from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { requireActor } from "@/identity/http";
import { assertTenantPermission, mapPosition } from "@/governance/http";
import { createPositionUseCases } from "@/governance/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const { tenantId } = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    assertTenantPermission(actor, tenantId, "position.read");
    return jsonResponse(
      (await createPositionUseCases().listPositions(tenantId)).map(mapPosition),
      id,
    );
  } catch (error) {
    return handleRouteError(error, id);
  }
}
export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const { tenantId } = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const payload = createPositionRequestSchema.parse(await request.json());
    assertTenantPermission(actor, tenantId, "position.manage");
    const now = new Date();
    const result = await createPositionUseCases().createPosition({
      id: crypto.randomUUID(),
      tenantId,
      ...payload,
      description: payload.description ?? null,
      sector: payload.sector ?? null,
      branch: payload.branch ?? null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return jsonResponse(mapPosition(result), id, { status: 201 });
  } catch (error) {
    return handleRouteError(error, id);
  }
}
