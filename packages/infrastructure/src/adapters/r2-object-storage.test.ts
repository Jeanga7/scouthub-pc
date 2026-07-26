import { describe, expect, it } from "vitest";
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
      checksumSha256Base64: "checksum",
      expiresInSeconds: 300
    });

    expect(signed.method).toBe("PUT");
    expect(signed.requiredHeaders).toEqual({
      "Content-Type": "image/png",
      "x-amz-checksum-sha256": "checksum"
    });
    expect(new URL(signed.url).searchParams.get("X-Amz-Expires")).toBe("300");
    expect(signed.url).not.toContain("secret");
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
});
