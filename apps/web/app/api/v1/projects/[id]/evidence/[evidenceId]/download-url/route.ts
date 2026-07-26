import {
  createEvidenceDownloadUrlRequestSchema,
  uuidSchema
} from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  mapDownloadUrlRequest,
  mapDownloadUrlResponse,
  requestId,
  requireEvidenceActor
} from "@/evidence/http";
import { createEvidenceUseCases } from "@/evidence/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const currentRequestId = requestId(request);
  try {
    const { id, evidenceId: rawEvidenceId } = await context.params;
    const projectId = uuidSchema.parse(id);
    const evidenceId = uuidSchema.parse(rawEvidenceId);
    const payload = createEvidenceDownloadUrlRequestSchema.parse(await request.json());
    const actor = await requireEvidenceActor(request, currentRequestId);
    const result = await createEvidenceUseCases().createDownloadUrl(
      mapDownloadUrlRequest({ actor, projectId, evidenceId, payload, requestId: currentRequestId })
    );
    return jsonResponse(mapDownloadUrlResponse(result), currentRequestId);
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
