import {
  approveProjectRequestSchema,
  uuidSchema
} from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  mapProject,
  mapWorkflowDecisionRequest,
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
    const payload = approveProjectRequestSchema.parse(await request.json());
    const actor = await requireProjectActor(request, currentRequestId);
    const useCases = createProjectUseCases();
    const project = await useCases.approveProjectForExecution(
      mapWorkflowDecisionRequest({ actor, payload, projectId, requestId: currentRequestId })
    );
    return jsonResponse(mapProject(project, useCases.getProjectCapabilities({ actor, project })), currentRequestId);
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
