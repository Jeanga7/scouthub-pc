import { handleRouteError, requestId } from "@/organizations/http";
import { identityJson, mapMe, requireActor } from "@/identity/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    return identityJson(mapMe(actor), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}

