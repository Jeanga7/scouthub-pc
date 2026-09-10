import { uuidSchema } from "@scouthub/contracts";
import { requireActor } from "@/identity/http";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { mapMembership } from "@/members/http";
import { createMemberUseCases } from "@/members/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ id: string }> },
) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const { id } = await params;
    const personId = uuidSchema.parse(id);
    const tenantId = uuidSchema.parse(
      new URL(request.url).searchParams.get("tenantId"),
    );
    const memberships = await createMemberUseCases().listMemberships({
      actor,
      tenantId,
      personId,
    });
    return jsonResponse(memberships.map(mapMembership), rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
