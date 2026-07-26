import {
  createProjectCommentRequestSchema,
  uuidSchema
} from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  mapCreateProjectCommentRequest,
  requestId,
  requireProjectActor
} from "@/projects/http";
import { createProjectUseCases } from "@/projects/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const currentRequestId = requestId(request);
  try {
    const { id } = await context.params;
    const projectId = uuidSchema.parse(id);
    const payload = createProjectCommentRequestSchema.parse(await request.json());
    const actor = await requireProjectActor(request, currentRequestId);
    const comment = await createProjectUseCases().addProjectComment(
      mapCreateProjectCommentRequest({ actor, payload, projectId, requestId: currentRequestId })
    );
    return jsonResponse({
      id: comment.id,
      approvalRequestId: comment.approvalRequestId,
      authorAccountId: comment.authorAccountId,
      kind: comment.kind,
      fieldKey: comment.fieldKey,
      body: comment.body,
      createdAt: comment.createdAt.toISOString()
    }, currentRequestId, { status: 201 });
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
