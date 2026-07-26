import { tenantQuerySchema } from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  mapProjectOwnerOptions,
  requestId,
  requireProjectActor
} from "@/projects/http";
import { createProjectUseCases } from "@/projects/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const url = new URL(request.url);
    const query = tenantQuerySchema.parse(Object.fromEntries(url.searchParams));
    const actor = await requireProjectActor(request, id);
    const options = await createProjectUseCases().listProjectOwnerOptions({
      actor,
      tenantId: query.tenantId
    });
    return jsonResponse(mapProjectOwnerOptions(options), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}
