import { updateMemberRequestSchema, uuidSchema } from "@scouthub/contracts";
import { requireActor } from "@/identity/http";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { mapMemberDetail } from "@/members/http";
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
    const member = await createMemberUseCases().getMember({
      actor,
      tenantId,
      personId,
    });
    return jsonResponse(mapMemberDetail(member), rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}

export async function PATCH(
  request: Request,
  { params }: { readonly params: Promise<{ id: string }> },
) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const { id } = await params;
    const personId = uuidSchema.parse(id);
    const payload = updateMemberRequestSchema.parse(await request.json());
    const member = await createMemberUseCases().updateMember({
      actor,
      requestId: rid,
      auditActor: { kind: "USER", id: actor.account.id },
      tenantId: payload.tenantId,
      personId,
      patch: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        birthDate:
          payload.birthDate === undefined
            ? undefined
            : payload.birthDate === null
              ? null
              : new Date(payload.birthDate),
        status: payload.status,
        profile: {
          sex: payload.sex,
          birthPlace: payload.birthPlace,
          primaryPhone: payload.primaryPhone,
          secondaryPhone: payload.secondaryPhone,
          email: payload.email,
          guardianName: payload.guardianName,
          guardianPhone: payload.guardianPhone,
          guardianRelationship: payload.guardianRelationship,
          insuranceNumber: payload.insuranceNumber,
          insuranceYear: payload.insuranceYear,
          joinedScoutingAt:
            payload.joinedScoutingAt === undefined
              ? undefined
              : payload.joinedScoutingAt === null
                ? null
                : new Date(payload.joinedScoutingAt),
          administrativeNotes: payload.administrativeNotes,
        },
      },
    });
    return jsonResponse(mapMemberDetail(member), rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
