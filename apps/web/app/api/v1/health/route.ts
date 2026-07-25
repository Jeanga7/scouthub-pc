import { healthResponseSchema } from "@scouthub/contracts";
import { getServerEnv } from "@/env/server";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();
  const payload = healthResponseSchema.parse({
    status: "ok",
    service: "scouthub-web",
    environment: env.APP_ENV,
    timestamp: new Date().toISOString()
  });

  return Response.json(payload, {
    headers: {
      "cache-control": "no-store"
    }
  });
}
