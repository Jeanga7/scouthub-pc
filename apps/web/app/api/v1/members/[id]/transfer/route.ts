import { transferMemberRequestSchema, uuidSchema } from "@scouthub/contracts";
import { requireActor } from "@/identity/http";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { mapMemberDetail } from "@/members/http";
import { createMemberUseCases } from "@/members/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ id: string }> },
) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const { id } = await params;
    const personId = uuidSchema.parse(id);
    const payload = transferMemberRequestSchema.parse(await request.json());
    const member = await createMemberUseCases().transferMember({
      actor,
      requestId: rid,
      auditActor: { kind: "USER", id: actor.account.id },
      tenantId: payload.tenantId,
      personId,
      organizationId: payload.organizationId,
      startsAt: new Date(payload.startsAt),
      branch: payload.branch ?? null,
    });
    return jsonResponse(mapMemberDetail(member), rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
