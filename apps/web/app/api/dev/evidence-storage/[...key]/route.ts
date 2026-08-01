import { deleteLocalObject, getLocalObject, localEtagFor, putLocalObject } from "@scouthub/infrastructure";
import { getServerEnv } from "@/env/server";

export const dynamic = "force-dynamic";

// Local-only backing store for the presigned upload flow.
//
// This route is not a second implementation of the storage port: the port stays
// the single seam (FakeObjectStorage under APP_ENV=test, LocalObjectStorage
// under APP_ENV=local, the R2 adapter everywhere else). It exists because a
// presigned PUT is performed by the browser, not by the server, so `local` needs
// an HTTP target to receive that body — an in-process fake cannot. Automated
// tests never reach this route; they drive FakeObjectStorage directly.
//
// Every verb is fail-closed on APP_ENV: outside `local` the route answers 404
// and touches no storage, so it cannot be reached in preview, staging or
// production even if it is accidentally deployed.

export async function PUT(request: Request, context: { params: Promise<{ readonly key: string[] }> }) {
  if (!isLocalDev()) {
    return new Response(null, { status: 404 });
  }
  const key = await decodeKey(context);
  const contentType = request.headers.get("content-type");
  if (contentType === null || contentType.trim().length === 0) {
    return new Response("Missing Content-Type.", { status: 400 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  putLocalObject({
    origin: getServerEnv().APP_ORIGIN,
    key,
    contentType,
    bytes
  });
  return new Response(null, {
    status: 200,
    headers: {
      etag: localEtagFor(bytes)
    }
  });
}

export async function GET(request: Request, context: { params: Promise<{ readonly key: string[] }> }) {
  if (!isLocalDev()) {
    return new Response(null, { status: 404 });
  }
  const key = await decodeKey(context);
  const object = getLocalObject({
    origin: getServerEnv().APP_ORIGIN,
    key
  });
  if (object === null) {
    return new Response(null, { status: 404 });
  }
  if (!matchesIfMatch(request, object.etag)) {
    return new Response(null, { status: 412 });
  }
  return new Response(object.bytes.slice(), {
    status: 200,
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.byteSize),
      etag: object.etag
    }
  });
}

export async function HEAD(request: Request, context: { params: Promise<{ readonly key: string[] }> }) {
  // Checked here as well as in GET: the guard must not depend on a delegation
  // that a later refactor could remove.
  if (!isLocalDev()) {
    return new Response(null, { status: 404 });
  }
  const response = await GET(request, context);
  return new Response(null, {
    status: response.status,
    headers: response.headers
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ readonly key: string[] }> }) {
  if (!isLocalDev()) {
    return new Response(null, { status: 404 });
  }
  const key = await decodeKey(context);
  deleteLocalObject({
    origin: getServerEnv().APP_ORIGIN,
    key
  });
  return new Response(null, { status: 204 });
}

function isLocalDev(): boolean {
  return getServerEnv().APP_ENV === "local";
}

async function decodeKey(context: { params: Promise<{ readonly key: string[] }> }): Promise<string> {
  const { key } = await context.params;
  return key.map(decodeURIComponent).join("/");
}

function matchesIfMatch(request: Request, etag: string): boolean {
  const expected = request.headers.get("if-match");
  if (expected === null || expected.trim().length === 0) {
    return true;
  }
  return expected === etag;
}
