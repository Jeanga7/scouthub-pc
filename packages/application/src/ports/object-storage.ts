export interface ObjectHandle {
  readonly key: string;
  readonly checksum?: string;
  readonly contentType?: string;
  readonly byteSize?: number;
}

export interface CreateUploadUrlInput {
  readonly key: string;
  readonly contentType: string;
  readonly byteSizeLimit: number;
  readonly expiresInSeconds: number;
}

export interface SignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<SignedUrl>;
  getDownloadUrl(object: ObjectHandle): Promise<SignedUrl>;
  deleteObject(object: ObjectHandle): Promise<void>;
}
