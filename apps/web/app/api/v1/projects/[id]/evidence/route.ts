import {
  listEvidenceQuerySchema,
  uuidSchema
} from "@scouthub/contracts";
import {
  decodeEvidenceCursor,
  encodeEvidenceCursor,
  handleRouteError,
  jsonResponse,
  mapEvidenceList,
  requestId,
  requireEvidenceActor
} from "@/evidence/http";
import { createEvidenceUseCases } from "@/evidence/service";

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
    const query = listEvidenceQuerySchema.parse(Object.fromEntries(url.searchParams));
    const actor = await requireEvidenceActor(request, currentRequestId);
    const page = await createEvidenceUseCases().listEvidence({
      actor,
      tenantId: query.tenantId,
      projectId,
      limit: query.limit ?? 20,
      cursor: decodeEvidenceCursor(query.cursor)
    });
    return jsonResponse(mapEvidenceList({
      items: page.items,
      nextCursor: encodeEvidenceCursor(page.nextCursor),
      canCreate: page.capabilities?.canCreate ?? false,
      actor
    }), currentRequestId);
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
