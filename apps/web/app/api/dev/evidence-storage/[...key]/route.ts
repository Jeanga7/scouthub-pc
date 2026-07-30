import { deleteLocalObject, getLocalObject, putLocalObject } from "@scouthub/infrastructure";
import { getServerEnv } from "@/env/server";

export const dynamic = "force-dynamic";

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

function localEtagFor(bytes: Uint8Array): string {
  return `"${bytes.byteLength.toString(16)}-${bytes[0] ?? 0}"`;
}
