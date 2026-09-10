import {
  createMemberRequestSchema,
  memberListQuerySchema,
} from "@scouthub/contracts";
import { requireActor } from "@/identity/http";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { mapMemberDetail, mapMemberList } from "@/members/http";
import { createMemberUseCases } from "@/members/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const query = memberListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const filters = [
      query.districtId,
      query.groupId,
      query.annexId,
      query.unitId,
    ].filter((value): value is string => value !== undefined);
    const result = await createMemberUseCases().listMembers({
      actor,
      tenantId: query.tenantId,
      query: query.q ?? null,
      filterOrganizationIds: filters,
      branch: query.branch ?? null,
      status: query.status ?? null,
      page,
      pageSize,
    });
    return jsonResponse(mapMemberList(result, page, pageSize), rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const payload = createMemberRequestSchema.parse(await request.json());
    const member = await createMemberUseCases().createMember({
      actor,
      requestId: rid,
      auditActor: { kind: "USER", id: actor.account.id },
      tenantId: payload.tenantId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      birthDate:
        payload.birthDate === null ? null : new Date(payload.birthDate),
      birthPlace: payload.birthPlace ?? null,
      sex: payload.sex,
      primaryPhone: payload.primaryPhone ?? null,
      secondaryPhone: payload.secondaryPhone ?? null,
      email: payload.email ?? null,
      guardianName: payload.guardianName ?? null,
      guardianPhone: payload.guardianPhone ?? null,
      guardianRelationship: payload.guardianRelationship ?? null,
      organizationId: payload.organizationId,
      startsAt: new Date(payload.startsAt),
      branch: payload.branch ?? null,
      insuranceNumber: payload.insuranceNumber ?? null,
      insuranceYear: payload.insuranceYear ?? null,
      joinedScoutingAt:
        payload.joinedScoutingAt === undefined ||
        payload.joinedScoutingAt === null
          ? null
          : new Date(payload.joinedScoutingAt),
      administrativeNotes: payload.administrativeNotes ?? null,
    });
    return jsonResponse(mapMemberDetail(member), rid, { status: 201 });
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
