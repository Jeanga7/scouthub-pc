import {
  inviteAdultUserRequestSchema,
  tenantQuerySchema
} from "@scouthub/contracts";
import { createIdentityUseCases } from "@/identity/service";
import { identityJson, mapInvitation, requireActor } from "@/identity/http";
import { handleRouteError, requestId } from "@/organizations/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const query = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    const invitations = await createIdentityUseCases().listInvitations(
      actor,
      query.tenantId
    );
    return identityJson(invitations.map(mapInvitation), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const payload = inviteAdultUserRequestSchema.parse(await request.json());
    const invitation = await createIdentityUseCases().inviteAdultUser({
      ...payload,
      actor,
      requestId: id
    });
    return identityJson(mapInvitation(invitation), id, { status: 201 });
  } catch (error) {
    return handleRouteError(error, id);
  }
}

