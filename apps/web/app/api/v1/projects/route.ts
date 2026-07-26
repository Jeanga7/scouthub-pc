import {
  createProjectDraftRequestSchema,
  listProjectsQuerySchema
} from "@scouthub/contracts";
import {
  decodeProjectCursor,
  encodeProjectCursor,
  handleRouteError,
  jsonResponse,
  mapCreateProjectRequest,
  mapProject,
  mapProjectList,
  requestId,
  requireProjectActor
} from "@/projects/http";
import { createProjectUseCases } from "@/projects/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const url = new URL(request.url);
    const query = listProjectsQuerySchema.parse(Object.fromEntries(url.searchParams));
    const actor = await requireProjectActor(request, id);
    const useCases = createProjectUseCases();
    const page = await useCases.listProjects({
      actor,
      tenantId: query.tenantId,
      limit: query.limit ?? 20,
      cursor: decodeProjectCursor(query.cursor),
      filters: {
        ownerOrganizationId: query.ownerOrganizationId,
        projectMode: query.projectMode,
        status: query.status
      }
    });
    return jsonResponse(mapProjectList({
      projects: page.projects,
      nextCursor: encodeProjectCursor(page.nextCursor)
    }), id);
  } catch (error) {
    return handleRouteError(error, id);
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const payload = createProjectDraftRequestSchema.parse(await request.json());
    const actor = await requireProjectActor(request, id);
    const created = await createProjectUseCases().createProjectDraft(
      mapCreateProjectRequest({ actor, payload, requestId: id })
    );
    return jsonResponse(mapProject(created), id, { status: 201 });
  } catch (error) {
    return handleRouteError(error, id);
  }
}

