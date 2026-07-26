import {
  initiateEvidenceUploadRequestSchema,
  uuidSchema
} from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  mapInitiateUploadRequest,
  mapInitiateUploadResponse,
  requestId,
  requireEvidenceActor
} from "@/evidence/http";
import { createEvidenceUseCases } from "@/evidence/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const currentRequestId = requestId(request);
  try {
    const { id } = await context.params;
    const projectId = uuidSchema.parse(id);
    const payload = initiateEvidenceUploadRequestSchema.parse(await request.json());
    const actor = await requireEvidenceActor(request, currentRequestId);
    const result = await createEvidenceUseCases().initiateEvidenceUpload(
      mapInitiateUploadRequest({ actor, projectId, payload, requestId: currentRequestId })
    );
    return jsonResponse(mapInitiateUploadResponse(result), currentRequestId, { status: 201 });
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
