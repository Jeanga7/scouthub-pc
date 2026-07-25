import { suspendAccountRequestSchema, uuidSchema } from "@scouthub/contracts";
import { createIdentityUseCases } from "@/identity/service";
import { identityJson, requireActor } from "@/identity/http";
import { handleRouteError, requestId } from "@/organizations/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const actor = await requireActor(request, id);
    const params = await context.params;
    const accountId = uuidSchema.parse(params.id);
    const payload = suspendAccountRequestSchema.parse(await request.json());
    const account = await createIdentityUseCases().suspendAccount({
      actor,
      tenantId: payload.tenantId,
      accountId,
      requestId: id
    });

    return identityJson(
      {
        id: account.id,
        primaryEmail: account.primaryEmail,
        status: account.status
      },
      id
    );
  } catch (error) {
    return handleRouteError(error, id);
  }
}

