import { listReviewsQuerySchema } from "@scouthub/contracts";
import {
  decodeReviewCursor,
  encodeReviewCursor,
  handleRouteError,
  jsonResponse,
  mapReviewQueue,
  requestId,
  requireProjectActor
} from "@/projects/http";
import { createProjectUseCases } from "@/projects/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentRequestId = requestId(request);
  try {
    const url = new URL(request.url);
    const query = listReviewsQuerySchema.parse(Object.fromEntries(url.searchParams));
    const actor = await requireProjectActor(request, currentRequestId);
    const page = await createProjectUseCases().listRegionalReviewQueue({
      actor,
      tenantId: query.tenantId,
      limit: query.limit ?? 20,
      cursor: decodeReviewCursor(query.cursor),
      status: query.status ?? "PENDING"
    });
    return jsonResponse(mapReviewQueue({
      page,
      nextCursor: encodeReviewCursor(page.nextCursor)
    }), currentRequestId);
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
