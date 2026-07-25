import {
  createRoleAssignmentRequestSchema,
  tenantQuerySchema
} from "@scouthub/contracts";
import { createIdentityUseCases } from "@/identity/service";
import { identityJson, mapRoleAssignment, requireActor } from "@/identity/http";
import { handleRouteError, requestId } from "@/organizations/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const query = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    const assignments = await createIdentityUseCases().listRoleAssignments(
      actor,
      query.tenantId
    );
    return identityJson(assignments.map(mapRoleAssignment), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const payload = createRoleAssignmentRequestSchema.parse(await request.json());
    const assignment = await createIdentityUseCases().createRoleAssignment({
      ...payload,
      actor,
      startsAt: new Date(payload.startsAt),
      endsAt: payload.endsAt === undefined || payload.endsAt === null ? null : new Date(payload.endsAt),
      requestId: id
    });
    return identityJson(mapRoleAssignment(assignment), id, { status: 201 });
  } catch (error) {
    return handleRouteError(error, id);
  }
}

