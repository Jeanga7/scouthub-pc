import {
  ObjectStorageError
} from "@scouthub/application";
import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectHead,
  ObjectStorage,
  PromoteObjectInput,
  SignedObjectUrl
} from "@scouthub/application";

export interface LocalObjectStorageConfig {
  readonly origin: string;
}

export interface LocalStoredObject {
  readonly contentType: string;
  readonly byteSize: number;
  readonly etag: string;
  readonly bytes: Uint8Array;
}

const storageByOrigin = new Map<string, Map<string, LocalStoredObject>>();

export function createLocalObjectStorageAdapter(config: LocalObjectStorageConfig): ObjectStorage {
  const objects = storageForOrigin(config.origin);

  return {
    async createUploadUrl(input: CreateUploadUrlInput): Promise<SignedObjectUrl> {
      return {
        url: new URL(`/api/dev/evidence-storage/${encodeObjectKey(input.key)}`, config.origin).toString(),
        method: "PUT",
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
        requiredHeaders: {
          "Content-Type": input.contentType
        }
      };
    },

    async createDownloadUrl(input: CreateDownloadUrlInput): Promise<SignedObjectUrl> {
      return {
        url: new URL(`/api/dev/evidence-storage/${encodeObjectKey(input.key)}`, config.origin).toString(),
        method: "GET",
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
        requiredHeaders: {}
      };
    },

    async headObject(key: string): Promise<ObjectHead | null> {
      const object = objects.get(key);
      return object === undefined
        ? null
        : {
            key,
            contentType: object.contentType,
            byteSize: object.byteSize,
            checksumSha256Base64: null,
            etag: object.etag
          };
    },

    async readObjectForVerification(input: {
      readonly key: string;
      readonly expectedEtag: string;
      readonly maxBytes: number;
    }): Promise<Uint8Array | null> {
      const object = objects.get(input.key);
      if (object === undefined) {
        return null;
      }
      if (object.etag !== input.expectedEtag) {
        throw new ObjectStorageError("Local source object changed.", "SOURCE_CHANGED");
      }
      return object.bytes.slice(0, input.maxBytes);
    },

    async promoteObject(input: PromoteObjectInput): Promise<void> {
      const source = objects.get(input.sourceKey);
      if (source === undefined) {
        throw new ObjectStorageError("Local source object not found.", "OBJECT_NOT_FOUND");
      }
      if (source.etag !== input.sourceEtag) {
        throw new ObjectStorageError("Local source object changed.", "SOURCE_CHANGED");
      }
      objects.set(input.destinationKey, source);
    },

    async deleteObject(key: string): Promise<void> {
      objects.delete(key);
    }
  };
}

export function putLocalObject(input: {
  readonly origin: string;
  readonly key: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}): void {
  const objects = storageForOrigin(input.origin);
  objects.set(input.key, {
    contentType: input.contentType,
    byteSize: input.bytes.byteLength,
    etag: localEtagFor(input.bytes),
    bytes: input.bytes
  });
}

export function getLocalObject(input: {
  readonly origin: string;
  readonly key: string;
}): LocalStoredObject | null {
  return storageForOrigin(input.origin).get(input.key) ?? null;
}

export function deleteLocalObject(input: {
  readonly origin: string;
  readonly key: string;
}): boolean {
  return storageForOrigin(input.origin).delete(input.key);
}

function storageForOrigin(origin: string): Map<string, LocalStoredObject> {
  const existing = storageByOrigin.get(origin);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Map<string, LocalStoredObject>();
  storageByOrigin.set(origin, created);
  return created;
}

function localEtagFor(bytes: Uint8Array): string {
  return `"${bytes.byteLength.toString(16)}-${bytes[0] ?? 0}"`;
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
