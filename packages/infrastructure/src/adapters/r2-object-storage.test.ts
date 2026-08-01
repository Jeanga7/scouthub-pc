import { describe, expect, it, vi } from "vitest";
import { AwsClient } from "aws4fetch";
import { createR2ObjectStorageAdapter } from "./r2-object-storage";

describe("R2 object storage adapter", () => {
  it("signs upload URLs with required headers and short expiry", async () => {
    const storage = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret"
    });

    const signed = await storage.createUploadUrl({
      key: "tmp/evidence/tenant/asset/random",
      contentType: "image/png",
      expiresInSeconds: 300
    });

    expect(signed.method).toBe("PUT");
    expect(signed.requiredHeaders).toEqual({
      "Content-Type": "image/png"
    });
    expect(new URL(signed.url).searchParams.get("X-Amz-Expires")).toBe("300");
    expect(signed.url).not.toContain("secret");
  });

  it("maps signing failures to ObjectStorageError without leaking secrets", async () => {
    const signSpy = vi.spyOn(AwsClient.prototype, "sign").mockRejectedValueOnce(new Error("sign failed"));
    const storage = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret"
    });

    await expect(storage.createDownloadUrl({
      key: "evidence/tenant/asset/random",
      expiresInSeconds: 300
    })).rejects.toMatchObject({
      name: "ObjectStorageError",
      code: "SIGNING_FAILED"
    });
    expect(signSpy).toHaveBeenCalled();
    signSpy.mockRestore();
  });

  it("maps HEAD and copy signing failures to SIGNING_FAILED without leaking secrets", async () => {
    const signSpy = vi.spyOn(AwsClient.prototype, "sign").mockRejectedValueOnce(new Error("sign failed"));
    const storage = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret"
    });

    await expect(storage.headObject("tmp/evidence/tenant/asset/random")).rejects.toMatchObject({
      name: "ObjectStorageError",
      code: "SIGNING_FAILED"
    });
    signSpy.mockRestore();

    const copySignSpy = vi.spyOn(AwsClient.prototype, "sign").mockRejectedValueOnce(new Error("sign failed"));
    await expect(storage.promoteObject({
      sourceKey: "tmp/evidence/tenant/asset/random",
      destinationKey: "evidence/tenant/asset/random",
      sourceEtag: "\"etag\"",
      contentType: "application/pdf"
    })).rejects.toMatchObject({
      name: "ObjectStorageError",
      code: "SIGNING_FAILED"
    });
    copySignSpy.mockRestore();
  });

  it("reads verification bytes with If-Match", async () => {
    const requests: Request[] = [];
    const fetcher: typeof fetch = (input) => {
      requests.push(input instanceof Request ? input : new Request(input));
      return Promise.resolve(new Response(Uint8Array.from([1, 2, 3]), { status: 206 }));
    };
    const storage = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret",
      fetch: fetcher
    });

    const bytes = await storage.readObjectForVerification({
      key: "tmp/evidence/tenant/asset/random",
      expectedEtag: "\"etag\"",
      maxBytes: 64
    });

    expect(Array.from(bytes ?? [])).toEqual([1, 2, 3]);
    const request = requests[0];
    if (request === undefined) {
      throw new Error("Expected fetch request.");
    }
    expect(request.headers.get("if-match")).toBe("\"etag\"");
    expect(request.headers.get("range")).toBe("bytes=0-63");
  });

  it("maps a body stream failure on a successful GET to storage unavailable", async () => {
    const storage = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret",
      fetch: () => Promise.resolve(new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Uint8Array.from([1, 2]));
            controller.error(new Error("stream interrupted"));
          }
        }),
        { status: 206 }
      ))
    });

    const failure = await storage.readObjectForVerification({
      key: "tmp/evidence/tenant/asset/random",
      expectedEtag: "\"etag\"",
      maxBytes: 64
    }).then(() => null, (error: unknown) => error);

    expect(failure).toMatchObject({
      name: "ObjectStorageError",
      code: "STORAGE_UNAVAILABLE"
    });
    const message = failure instanceof Error ? failure.message : "";
    expect(message).not.toContain("secret");
    expect(message).not.toContain("access");
    expect(message).not.toContain("X-Amz");
    expect(message).not.toContain("tmp/evidence");
  });

  it("maps GET 412 and 500 to source changed or storage unavailable", async () => {
    const storage = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret",
      fetch: () => Promise.resolve(new Response(null, { status: 412 }))
    });

    await expect(storage.readObjectForVerification({
      key: "tmp/evidence/tenant/asset/random",
      expectedEtag: "\"etag\"",
      maxBytes: 64
    })).rejects.toMatchObject({ code: "SOURCE_CHANGED" });

    const failing = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret",
      fetch: () => Promise.resolve(new Response(null, { status: 500 }))
    });

    await expect(failing.readObjectForVerification({
      key: "tmp/evidence/tenant/asset/random",
      expectedEtag: "\"etag\"",
      maxBytes: 64
    })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });

  it("maps network failures during verification and copy to storage unavailable", async () => {
    const failingFetch: typeof fetch = () => Promise.reject(new Error("network"));
    const storage = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret",
      fetch: failingFetch
    });

    await expect(storage.headObject("tmp/evidence/tenant/asset/random")).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE"
    });
    await expect(storage.readObjectForVerification({
      key: "tmp/evidence/tenant/asset/random",
      expectedEtag: "\"etag\"",
      maxBytes: 64
    })).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE"
    });
    await expect(storage.promoteObject({
      sourceKey: "tmp/evidence/tenant/asset/random",
      destinationKey: "evidence/tenant/asset/random",
      sourceEtag: "\"etag\"",
      contentType: "application/pdf"
    })).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE"
    });
  });

  it("uses conditional CopyObject headers for promotion", async () => {
    const requests: Request[] = [];
    const fetcher: typeof fetch = (input) => {
      requests.push(input instanceof Request ? input : new Request(input));
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    const storage = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret",
      fetch: fetcher
    });

    await storage.promoteObject({
      sourceKey: "tmp/evidence/tenant/asset/random",
      destinationKey: "evidence/tenant/asset/random",
      sourceEtag: "\"etag\"",
      contentType: "application/pdf"
    });

    const request = requests[0];
    expect(request).toBeDefined();
    if (request === undefined) {
      throw new Error("Expected fetch request.");
    }
    expect(request).toBeInstanceOf(Request);
    const headers = request.headers;
    expect(headers.get("x-amz-copy-source")).toBe("/bucket/tmp/evidence/tenant/asset/random");
    expect(headers.get("x-amz-copy-source-if-match")).toBe("\"etag\"");
  });

  it("maps CopyObject and delete failures", async () => {
    const storage = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret",
      fetch: () => Promise.resolve(new Response(null, { status: 404 }))
    });

    await expect(storage.promoteObject({
      sourceKey: "tmp/evidence/tenant/asset/random",
      destinationKey: "evidence/tenant/asset/random",
      sourceEtag: "\"etag\"",
      contentType: "application/pdf"
    })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });

    const unavailable = createR2ObjectStorageAdapter({
      accountId: "account",
      bucketName: "bucket",
      accessKeyId: "access",
      secretAccessKey: "secret",
      fetch: () => Promise.resolve(new Response(null, { status: 500 }))
    });

    await expect(unavailable.promoteObject({
      sourceKey: "tmp/evidence/tenant/asset/random",
      destinationKey: "evidence/tenant/asset/random",
      sourceEtag: "\"etag\"",
      contentType: "application/pdf"
    })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    await expect(unavailable.deleteObject("evidence/tenant/asset/random")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
});
