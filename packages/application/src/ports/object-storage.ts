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

export interface CreateUploadUrlInput {
  readonly key: string;
  readonly contentType: string;
  readonly checksumSha256Base64: string;
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
  readObjectPrefix(key: string, byteLength: number): Promise<Uint8Array | null>;
  promoteObject(input: PromoteObjectInput): Promise<void>;
  deleteObject(key: string): Promise<void>;
}
