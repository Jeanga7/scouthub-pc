import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectHead,
  ObjectStorage,
  PromoteObjectInput,
  SignedObjectUrl
} from "./object-storage";

export interface FakeStoredObject {
  readonly contentType: string;
  readonly byteSize: number;
  readonly checksumSha256Base64: string;
  readonly etag: string;
  readonly prefix: Uint8Array;
}

export class FakeObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, FakeStoredObject>();
  readonly deletedKeys: string[] = [];
  readonly promoted: PromoteObjectInput[] = [];
  failUploadSigning = false;
  failDownloadSigning = false;
  failPromotion = false;
  failDelete = false;

  putObject(key: string, object: FakeStoredObject): void {
    this.objects.set(key, object);
  }

  createUploadUrl(input: CreateUploadUrlInput): Promise<SignedObjectUrl> {
    if (this.failUploadSigning) {
      return Promise.reject(new Error("fake upload signing failure"));
    }
    return Promise.resolve({
      url: `https://storage.test/${encodeURIComponent(input.key)}?signed=put`,
      method: "PUT",
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      requiredHeaders: {
        "Content-Type": input.contentType,
        "x-amz-checksum-sha256": input.checksumSha256Base64
      }
    });
  }

  createDownloadUrl(input: CreateDownloadUrlInput): Promise<SignedObjectUrl> {
    if (this.failDownloadSigning) {
      return Promise.reject(new Error("fake download signing failure"));
    }
    return Promise.resolve({
      url: `https://storage.test/${encodeURIComponent(input.key)}?signed=get`,
      method: "GET",
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      requiredHeaders: {}
    });
  }

  headObject(key: string): Promise<ObjectHead | null> {
    const object = this.objects.get(key);
    return Promise.resolve(object === undefined
      ? null
      : {
          key,
          contentType: object.contentType,
          byteSize: object.byteSize,
          checksumSha256Base64: object.checksumSha256Base64,
          etag: object.etag
        });
  }

  readObjectPrefix(key: string, byteLength: number): Promise<Uint8Array> {
    const object = this.objects.get(key);
    if (object === undefined) {
      return Promise.reject(new Error("fake object missing"));
    }
    return Promise.resolve(object.prefix.slice(0, byteLength));
  }

  promoteObject(input: PromoteObjectInput): Promise<void> {
    if (this.failPromotion) {
      return Promise.reject(new Error("fake promotion failure"));
    }
    const source = this.objects.get(input.sourceKey);
    if (source === undefined || source.etag !== input.sourceEtag) {
      return Promise.reject(new Error("fake conditional copy failure"));
    }
    this.promoted.push(input);
    this.objects.set(input.destinationKey, source);
    return Promise.resolve();
  }

  deleteObject(key: string): Promise<void> {
    if (this.failDelete) {
      return Promise.reject(new Error("fake delete failure"));
    }
    this.deletedKeys.push(key);
    this.objects.delete(key);
    return Promise.resolve();
  }
}
