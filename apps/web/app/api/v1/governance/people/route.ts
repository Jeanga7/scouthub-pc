import { governancePersonSearchQuerySchema } from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  requestId,
} from "@/organizations/http";
import { requireActor } from "@/identity/http";
import {
  canSearchGovernancePeople,
  mapGovernancePersonOption,
} from "@/governance/http";
import { ApplicationError } from "@scouthub/application";
import { createGovernancePersonDirectoryUseCases } from "@/governance/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    const actor = await requireActor(request, rid);
    const { tenantId, q } = governancePersonSearchQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!canSearchGovernancePeople(actor, tenantId))
      throw new ApplicationError("Permission denied.", "AUTHZ_DENIED", 403);
    const people = await createGovernancePersonDirectoryUseCases().searchPeople(
      tenantId,
      q ?? null,
    );
    return jsonResponse(people.map(mapGovernancePersonOption), rid);
  } catch (error) {
    return handleRouteError(error, rid);
  }
}
