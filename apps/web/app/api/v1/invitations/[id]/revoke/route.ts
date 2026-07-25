import { revokeInvitationRequestSchema, uuidSchema } from "@scouthub/contracts";
import { createIdentityUseCases } from "@/identity/service";
import { identityJson, mapInvitation, requireActor } from "@/identity/http";
import { handleRouteError, requestId } from "@/organizations/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const params = await context.params;
    const invitationId = uuidSchema.parse(params.id);
    const payload = revokeInvitationRequestSchema.parse(await request.json());
    const invitation = await createIdentityUseCases().revokeInvitation({
      actor,
      tenantId: payload.tenantId,
      invitationId,
      requestId: id
    });
    return identityJson(mapInvitation(invitation), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
