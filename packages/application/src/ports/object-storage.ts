export interface SignedObjectUrl {
  readonly url: string;
  readonly method: "PUT" | "GET";
  readonly expiresAt: Date;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface ObjectHead {
  readonly key: string;
  readonly contentType: string | null;
  readonly byteSize: number;
  readonly checksumSha256Base64: string | null;
  readonly etag: string | null;
}

export type ObjectStorageErrorCode =
  | "OBJECT_NOT_FOUND"
  | "SOURCE_CHANGED"
  | "STORAGE_UNAVAILABLE"
  | "SIGNING_FAILED";

export class ObjectStorageError extends Error {
  constructor(
    message: string,
    readonly code: ObjectStorageErrorCode
  ) {
    super(message);
    this.name = "ObjectStorageError";
  }
}

export interface CreateUploadUrlInput {
  readonly key: string;
  readonly contentType: string;
  readonly expiresInSeconds: number;
}

export interface CreateDownloadUrlInput {
  readonly key: string;
  readonly expiresInSeconds: number;
}

export interface PromoteObjectInput {
  readonly sourceKey: string;
  readonly destinationKey: string;
  readonly sourceEtag: string;
  readonly contentType: string;
}

export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<SignedObjectUrl>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<SignedObjectUrl>;
  headObject(key: string): Promise<ObjectHead | null>;
  readObjectForVerification(input: {
    readonly key: string;
    readonly expectedEtag: string;
    readonly maxBytes: number;
  }): Promise<Uint8Array | null>;
  promoteObject(input: PromoteObjectInput): Promise<void>;
  deleteObject(key: string): Promise<void>;
}
