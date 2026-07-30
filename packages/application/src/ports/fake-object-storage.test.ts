import { describe, expect, it } from "vitest";
import { FakeObjectStorage } from "./fake-object-storage";

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
});
