import {
  ObjectStorageError
} from "./object-storage";
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
  readonly bytes: Uint8Array;
}

export class FakeObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, FakeStoredObject>();
  readonly deletedKeys: string[] = [];
  readonly promoted: PromoteObjectInput[] = [];
  headCalls = 0;
  readCalls = 0;
  promoteCalls = 0;
  deleteCalls = 0;
  uploadSignCalls = 0;
  downloadSignCalls = 0;
  failTempHead = false;
  failTempRead = false;
  failCopyBeforeRequest = false;
  failCopyAmbiguous = false;
  failPermanentHeadSigning = false;
  failPermanentHeadUnavailable = false;
  failUploadSigning = false;
  failDownloadSigning = false;
  failHead = false;
  failRead = false;
  failPromotion = false;
  failDelete = false;

  putObject(key: string, object: FakeStoredObject): void {
    this.objects.set(key, object);
  }

  createUploadUrl(input: CreateUploadUrlInput): Promise<SignedObjectUrl> {
    this.uploadSignCalls += 1;
    if (this.failUploadSigning) {
      return Promise.reject(new ObjectStorageError("fake upload signing failure", "SIGNING_FAILED"));
    }
    return Promise.resolve({
      url: `https://storage.test/${encodeURIComponent(input.key)}?signed=put`,
      method: "PUT",
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      requiredHeaders: {
        "Content-Type": input.contentType
      }
    });
  }

  createDownloadUrl(input: CreateDownloadUrlInput): Promise<SignedObjectUrl> {
    this.downloadSignCalls += 1;
    if (this.failDownloadSigning) {
      return Promise.reject(new ObjectStorageError("fake download signing failure", "SIGNING_FAILED"));
    }
    return Promise.resolve({
      url: `https://storage.test/${encodeURIComponent(input.key)}?signed=get`,
      method: "GET",
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      requiredHeaders: {}
    });
  }

  headObject(key: string): Promise<ObjectHead | null> {
    this.headCalls += 1;
    if (this.isTemporaryKey(key) && this.failTempHead) {
      return Promise.reject(new ObjectStorageError("fake temporary head signing failure", "SIGNING_FAILED"));
    }
    if (this.isPermanentKey(key) && this.failPermanentHeadSigning) {
      return Promise.reject(new ObjectStorageError("fake permanent head signing failure", "SIGNING_FAILED"));
    }
    if (this.isPermanentKey(key) && this.failPermanentHeadUnavailable) {
      return Promise.reject(new ObjectStorageError("fake permanent head failure", "STORAGE_UNAVAILABLE"));
    }
    if (this.failHead) {
      return Promise.reject(new ObjectStorageError("fake head failure", "STORAGE_UNAVAILABLE"));
    }
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

  readObjectForVerification(input: {
    readonly key: string;
    readonly expectedEtag: string;
    readonly maxBytes: number;
  }): Promise<Uint8Array | null> {
    this.readCalls += 1;
    if (this.isTemporaryKey(input.key) && this.failTempRead) {
      return Promise.reject(new ObjectStorageError("fake temporary read signing failure", "SIGNING_FAILED"));
    }
    if (this.failRead) {
      return Promise.reject(new ObjectStorageError("fake read failure", "STORAGE_UNAVAILABLE"));
    }
    const object = this.objects.get(input.key);
    if (object === undefined) {
      return Promise.resolve(null);
    }
    if (object.etag !== input.expectedEtag) {
      return Promise.reject(new ObjectStorageError("fake source changed", "SOURCE_CHANGED"));
    }
    return Promise.resolve(object.bytes.slice(0, input.maxBytes));
  }

  promoteObject(input: PromoteObjectInput): Promise<void> {
    this.promoteCalls += 1;
    if (this.failCopyBeforeRequest) {
      return Promise.reject(new ObjectStorageError("fake copy signing failure", "SIGNING_FAILED"));
    }
    if (this.failCopyAmbiguous) {
      return Promise.reject(new ObjectStorageError("fake copy failure", "STORAGE_UNAVAILABLE"));
    }
    if (this.failPromotion) {
      return Promise.reject(new ObjectStorageError("fake promotion failure", "STORAGE_UNAVAILABLE"));
    }
    const source = this.objects.get(input.sourceKey);
    if (source === undefined || source.etag !== input.sourceEtag) {
      return Promise.reject(new ObjectStorageError("fake conditional copy failure", "SOURCE_CHANGED"));
    }
    this.promoted.push(input);
    this.objects.set(input.destinationKey, source);
    return Promise.resolve();
  }

  deleteObject(key: string): Promise<void> {
    this.deleteCalls += 1;
    if (this.failDelete) {
      return Promise.reject(new ObjectStorageError("fake delete failure", "STORAGE_UNAVAILABLE"));
    }
    this.deletedKeys.push(key);
    this.objects.delete(key);
    return Promise.resolve();
  }

  private isTemporaryKey(key: string): boolean {
    return key.startsWith("tmp/evidence/");
  }

  private isPermanentKey(key: string): boolean {
    return key.startsWith("evidence/");
  }
}
