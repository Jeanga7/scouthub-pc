import { describe, expect, it } from "vitest";
import { FakeObjectStorage } from "./fake-object-storage";
import { ObjectStorageError } from "./object-storage";

describe("FakeObjectStorage", () => {
  it("tracks calls and simulates storage errors", async () => {
    const storage = new FakeObjectStorage();
    storage.putObject("tmp/evidence/t/a/r", {
      contentType: "image/png",
      byteSize: 4,
      checksumSha256Base64: "checksum",
      etag: "\"etag\"",
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
    });

    const head = await storage.headObject("tmp/evidence/t/a/r");
    const bytes = await storage.readObjectForVerification({
      key: "tmp/evidence/t/a/r",
      expectedEtag: "\"etag\"",
      maxBytes: 4
    });
    await storage.promoteObject({
      sourceKey: "tmp/evidence/t/a/r",
      destinationKey: "evidence/t/a/r",
      sourceEtag: "\"etag\"",
      contentType: "image/png"
    });
    await storage.deleteObject("tmp/evidence/t/a/r");

    expect(head?.etag).toBe("\"etag\"");
    expect(Array.from(bytes ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(storage.headCalls).toBe(1);
    expect(storage.readCalls).toBe(1);
    expect(storage.promoteCalls).toBe(1);
    expect(storage.deleteCalls).toBe(1);
    expect(storage.promoted).toHaveLength(1);
    expect(storage.deletedKeys).toContain("tmp/evidence/t/a/r");
  });

  it("simulates provider failures deterministically", async () => {
    const storage = new FakeObjectStorage();
    storage.failUploadSigning = true;
    storage.failDownloadSigning = true;
    storage.failHead = true;
    storage.failRead = true;
    storage.failPromotion = true;
    storage.failDelete = true;

    await expect(storage.createUploadUrl({
      key: "tmp/evidence/t/a/r",
      contentType: "image/png",
      expiresInSeconds: 60
    })).rejects.toBeInstanceOf(ObjectStorageError);
    await expect(storage.createDownloadUrl({
      key: "evidence/t/a/r",
      expiresInSeconds: 60
    })).rejects.toBeInstanceOf(ObjectStorageError);
    await expect(storage.headObject("tmp/evidence/t/a/r")).rejects.toBeInstanceOf(ObjectStorageError);
    await expect(storage.readObjectForVerification({
      key: "tmp/evidence/t/a/r",
      expectedEtag: "\"etag\"",
      maxBytes: 4
    })).rejects.toBeInstanceOf(ObjectStorageError);
    await expect(storage.promoteObject({
      sourceKey: "tmp/evidence/t/a/r",
      destinationKey: "evidence/t/a/r",
      sourceEtag: "\"etag\"",
      contentType: "image/png"
    })).rejects.toBeInstanceOf(ObjectStorageError);
    await expect(storage.deleteObject("tmp/evidence/t/a/r")).rejects.toBeInstanceOf(ObjectStorageError);

    expect(storage.uploadSignCalls).toBe(1);
    expect(storage.downloadSignCalls).toBe(1);
    expect(storage.headCalls).toBe(1);
    expect(storage.readCalls).toBe(1);
    expect(storage.promoteCalls).toBe(1);
    expect(storage.deleteCalls).toBe(1);
  });

  it("simulates phase-specific verification failures", async () => {
    const storage = new FakeObjectStorage();
    storage.putObject("tmp/evidence/t/a/r", {
      contentType: "image/png",
      byteSize: 4,
      checksumSha256Base64: "checksum",
      etag: "\"temp-etag\"",
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
    });
    storage.putObject("evidence/t/a/r", {
      contentType: "image/png",
      byteSize: 4,
      checksumSha256Base64: "checksum",
      etag: "\"perm-etag\"",
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
    });

    storage.failTempHead = true;
    await expect(storage.headObject("tmp/evidence/t/a/r")).rejects.toMatchObject({ code: "SIGNING_FAILED" });

    storage.failTempHead = false;
    storage.failTempRead = true;
    await expect(storage.readObjectForVerification({
      key: "tmp/evidence/t/a/r",
      expectedEtag: "\"temp-etag\"",
      maxBytes: 4
    })).rejects.toMatchObject({ code: "SIGNING_FAILED" });

    storage.failTempRead = false;
    storage.failCopyBeforeRequest = true;
    await expect(storage.promoteObject({
      sourceKey: "tmp/evidence/t/a/r",
      destinationKey: "evidence/t/a/r",
      sourceEtag: "\"temp-etag\"",
      contentType: "image/png"
    })).rejects.toMatchObject({ code: "SIGNING_FAILED" });

    storage.failCopyBeforeRequest = false;
    storage.failCopyAmbiguous = true;
    await expect(storage.promoteObject({
      sourceKey: "tmp/evidence/t/a/r",
      destinationKey: "evidence/t/a/r",
      sourceEtag: "\"temp-etag\"",
      contentType: "image/png"
    })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });

    storage.failCopyAmbiguous = false;
    storage.failPermanentHeadSigning = true;
    await expect(storage.headObject("evidence/t/a/r")).rejects.toMatchObject({ code: "SIGNING_FAILED" });

    storage.failPermanentHeadSigning = false;
    storage.failPermanentHeadUnavailable = true;
    await expect(storage.headObject("evidence/t/a/r")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
});
