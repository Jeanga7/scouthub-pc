import type {
  CreateUploadUrlInput,
  ObjectHandle,
  ObjectStorage,
  SignedUrl
} from "@scouthub/application";

export interface R2ObjectStorageBinding {
  createSignedUploadUrl(input: CreateUploadUrlInput): Promise<SignedUrl>;
  createSignedDownloadUrl(object: ObjectHandle): Promise<SignedUrl>;
  delete(key: string): Promise<void>;
}

export function createR2ObjectStorageAdapter(
  bucket: R2ObjectStorageBinding
): ObjectStorage {
  return {
    createUploadUrl(input) {
      return bucket.createSignedUploadUrl(input);
    },
    getDownloadUrl(object) {
      return bucket.createSignedDownloadUrl(object);
    },
    deleteObject(object) {
      return bucket.delete(object.key);
    }
  };
}
