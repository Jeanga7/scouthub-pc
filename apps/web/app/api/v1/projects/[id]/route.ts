import {
  tenantQuerySchema,
  updateProjectDraftRequestSchema,
  uuidSchema
} from "@scouthub/contracts";
import {
  handleRouteError,
  jsonResponse,
  mapProject,
  mapUpdateProjectRequest,
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
    const useCases = createProjectUseCases();
    const details = await useCases.getProject({
      actor,
      tenantId: query.tenantId,
      projectId
    });
    return jsonResponse(
      mapProject(details, useCases.getProjectCapabilities({ actor, project: details })),
      currentRequestId
    );
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const currentRequestId = requestId(request);
  try {
    const { id } = await context.params;
    const projectId = uuidSchema.parse(id);
    const payload = updateProjectDraftRequestSchema.parse(await request.json());
    const actor = await requireProjectActor(request, currentRequestId);
    const updated = await createProjectUseCases().updateProjectDraft(
      mapUpdateProjectRequest({
        actor,
        payload,
        projectId,
        requestId: currentRequestId
      })
    );
    return jsonResponse(mapProject(updated), currentRequestId);
  } catch (error) {
    return handleRouteError(error, currentRequestId);
  }
}
