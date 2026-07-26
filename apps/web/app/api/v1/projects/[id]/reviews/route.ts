import {
  tenantQuerySchema,
  uuidSchema
} from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  mapProjectReviewHistory,
  requestId,
  requireProjectActor
} from "@/projects/http";
import { createProjectUseCases } from "@/projects/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const currentRequestId = requestId(request);
  try {
    const { id } = await context.params;
    const projectId = uuidSchema.parse(id);
    const url = new URL(request.url);
    const query = tenantQuerySchema.parse(Object.fromEntries(url.searchParams));
    const actor = await requireProjectActor(request, currentRequestId);
    const history = await createProjectUseCases().getProjectReviewHistory({
      actor,
      tenantId: query.tenantId,
      projectId
    });
    return jsonResponse(mapProjectReviewHistory(history), currentRequestId);
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
