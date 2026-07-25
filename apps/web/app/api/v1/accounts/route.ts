import { tenantQuerySchema } from "@scouthub/contracts";
import { createIdentityUseCases } from "@/identity/service";
import {
  identityJson,
  mapAccountAdministration,
  requireActor
} from "@/identity/http";
import { handleRouteError, requestId } from "@/organizations/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const query = tenantQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    const accounts = await createIdentityUseCases().listAccounts(
      actor,
      query.tenantId
    );
    return identityJson(accounts.map(mapAccountAdministration), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
