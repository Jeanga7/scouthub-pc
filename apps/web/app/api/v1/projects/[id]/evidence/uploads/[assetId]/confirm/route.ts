import {
  confirmEvidenceUploadRequestSchema,
  uuidSchema
} from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  mapConfirmUploadRequest,
  mapEvidence,
  requestId,
  requireEvidenceActor
} from "@/evidence/http";
import { createEvidenceUseCases } from "@/evidence/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; assetId: string }> }
) {
  const currentRequestId = requestId(request);
  try {
    const { id, assetId: rawAssetId } = await context.params;
    const projectId = uuidSchema.parse(id);
    const assetId = uuidSchema.parse(rawAssetId);
    const payload = confirmEvidenceUploadRequestSchema.parse(await request.json());
    const actor = await requireEvidenceActor(request, currentRequestId);
    const evidence = await createEvidenceUseCases().confirmEvidenceUpload(
      mapConfirmUploadRequest({ actor, projectId, assetId, payload, requestId: currentRequestId })
    );
    return jsonResponse(mapEvidence(evidence, actor), currentRequestId, { status: 201 });
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
