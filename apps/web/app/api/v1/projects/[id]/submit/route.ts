import {
  uuidSchema,
  workflowVersionRequestSchema
} from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  mapProject,
  mapWorkflowVersionRequest,
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
    const payload = workflowVersionRequestSchema.parse(await request.json());
    const actor = await requireProjectActor(request, currentRequestId);
    const useCases = createProjectUseCases();
    const result = await useCases.submitProjectForReview(
      mapWorkflowVersionRequest({ actor, payload, projectId, requestId: currentRequestId })
    );
    return jsonResponse({
      project: mapProject(result.project, useCases.getProjectCapabilities({ actor, project: result.project })),
      approvalRequest: {
        id: result.approvalRequest.id,
        tenantId: result.approvalRequest.tenantId,
        projectId: result.approvalRequest.projectId,
        status: result.approvalRequest.status,
        submittedProjectVersion: result.approvalRequest.submittedProjectVersion,
        requestedByAccountId: result.approvalRequest.requestedByAccountId,
        requestedAt: result.approvalRequest.requestedAt.toISOString(),
        resolvedAt: result.approvalRequest.resolvedAt?.toISOString() ?? null
      }
    }, currentRequestId);
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
