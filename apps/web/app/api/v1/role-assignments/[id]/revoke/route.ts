import { revokeRoleAssignmentRequestSchema, uuidSchema } from "@scouthub/contracts";
import { createIdentityUseCases } from "@/identity/service";
import { identityJson, mapRoleAssignment, requireActor } from "@/identity/http";
import { handleRouteError, requestId } from "@/organizations/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const params = await context.params;
    const roleAssignmentId = uuidSchema.parse(params.id);
    const payload = revokeRoleAssignmentRequestSchema.parse(await request.json());
    const assignment = await createIdentityUseCases().revokeRoleAssignment({
      actor,
      tenantId: payload.tenantId,
      roleAssignmentId,
      reason: payload.reason ?? null,
      requestId: id
    });
    return identityJson(mapRoleAssignment(assignment), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
