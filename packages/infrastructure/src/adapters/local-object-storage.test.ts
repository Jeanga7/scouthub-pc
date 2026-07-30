import { describe, expect, it } from "vitest";
import { createLocalObjectStorageAdapter, deleteLocalObject, getLocalObject, putLocalObject } from "./local-object-storage";

describe("Local object storage adapter", () => {
  it("serves local browser URLs and shared in-memory objects", async () => {
    const storage = createLocalObjectStorageAdapter({ origin: "http://localhost:3000" });
    const signed = await storage.createUploadUrl({
      key: "tmp/evidence/tenant/asset/random",
      contentType: "image/jpeg",
      expiresInSeconds: 300
    });

    expect(signed.url).toBe("http://localhost:3000/api/dev/evidence-storage/tmp/evidence/tenant/asset/random");
    expect(signed.requiredHeaders).toEqual({ "Content-Type": "image/jpeg" });

    putLocalObject({
      origin: "http://localhost:3000",
      key: "tmp/evidence/tenant/asset/random",
      contentType: "image/jpeg",
      bytes: Uint8Array.from([0xff, 0xd8, 0xff])
    });

    const head = await storage.headObject("tmp/evidence/tenant/asset/random");
    const bytes = await storage.readObjectForVerification({
      key: "tmp/evidence/tenant/asset/random",
      expectedEtag: getLocalObject({
        origin: "http://localhost:3000",
        key: "tmp/evidence/tenant/asset/random"
      })!.etag,
      maxBytes: 3
    });
    await storage.promoteObject({
      sourceKey: "tmp/evidence/tenant/asset/random",
      destinationKey: "evidence/tenant/asset/random",
      sourceEtag: head!.etag!,
      contentType: "image/jpeg"
    });

    expect(head?.contentType).toBe("image/jpeg");
    expect(Array.from(bytes ?? [])).toEqual([0xff, 0xd8, 0xff]);
    expect(await storage.headObject("evidence/tenant/asset/random")).not.toBeNull();

    await storage.deleteObject("evidence/tenant/asset/random");
    deleteLocalObject({
      origin: "http://localhost:3000",
      key: "tmp/evidence/tenant/asset/random"
    });
  });
});
