import {
  problemResponse,
  requestId
} from "@/organizations/http";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  const id = requestId(request);
  return problemResponse({
    requestId: id,
    status: 403,
    title: "BOOTSTRAP_HTTP_FORBIDDEN",
    detail: "Tenant root creation is not exposed over HTTP after Slice 2."
  });
}
