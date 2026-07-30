import { AwsClient } from "aws4fetch";
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

export interface R2ObjectStorageConfig {
  readonly accountId: string;
  readonly bucketName: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly fetch?: typeof fetch;
}

export function createR2ObjectStorageAdapter(config: R2ObjectStorageConfig): ObjectStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto"
  });
  const fetcher = config.fetch ?? fetch;
  const baseUrl = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}`;

  async function signedRequest(url: string, init: RequestInit): Promise<Response> {
    const signed = await client.sign(url, init);
    return fetcher(signed);
  }

  return {
    async createUploadUrl(input: CreateUploadUrlInput): Promise<SignedObjectUrl> {
      const headers = {
        "Content-Type": input.contentType
      };
      const signed = await client.sign(objectUrl(baseUrl, input.key, input.expiresInSeconds), {
        method: "PUT",
        headers,
        aws: {
          signQuery: true,
          allHeaders: true
        }
      });
      return {
        url: signed.url,
        method: "PUT",
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
        requiredHeaders: headers
      };
    },

    async createDownloadUrl(input: CreateDownloadUrlInput): Promise<SignedObjectUrl> {
      const signed = await client.sign(objectUrl(baseUrl, input.key, input.expiresInSeconds), {
        method: "GET",
        aws: {
          signQuery: true
        }
      });
      return {
        url: signed.url,
        method: "GET",
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
        requiredHeaders: {}
      };
    },

    async headObject(key: string): Promise<ObjectHead | null> {
      const response = await signedRequest(objectUrl(baseUrl, key), { method: "HEAD" });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`R2 HEAD failed with status ${response.status}.`);
      }
      return {
        key,
        contentType: response.headers.get("content-type"),
        byteSize: Number(response.headers.get("content-length") ?? 0),
        checksumSha256Base64: response.headers.get("x-amz-checksum-sha256"),
        etag: response.headers.get("etag")
      };
    },

    async readObjectForVerification(input: {
      readonly key: string;
      readonly expectedEtag: string;
      readonly maxBytes: number;
    }): Promise<Uint8Array | null> {
      const response = await signedRequest(objectUrl(baseUrl, input.key), {
        method: "GET",
        headers: {
          Range: `bytes=0-${Math.max(0, input.maxBytes - 1)}`,
          "If-Match": input.expectedEtag
        }
      });
      if (response.status === 404) {
        return null;
      }
      if (response.status === 412) {
        throw new ObjectStorageError("R2 source object changed.", "SOURCE_CHANGED");
      }
      if (!response.ok) {
        throw new ObjectStorageError(`R2 verification read failed with status ${response.status}.`, "STORAGE_UNAVAILABLE");
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async promoteObject(input: PromoteObjectInput): Promise<void> {
      // Promotion is conditional on the ETag observed during verification. If
      // a replayed PUT replaces tmp/* between HEAD and CopyObject, R2 refuses
      // the copy and the accepted Evidence never points at mutable content.
      const response = await signedRequest(objectUrl(baseUrl, input.destinationKey), {
        method: "PUT",
        headers: {
          "Content-Type": input.contentType,
          "x-amz-copy-source": `/${config.bucketName}/${encodeObjectKey(input.sourceKey)}`,
          "x-amz-copy-source-if-match": input.sourceEtag
        }
      });
      if (response.status === 412) {
        throw new ObjectStorageError("R2 source object changed.", "SOURCE_CHANGED");
      }
      if (!response.ok) {
        throw new ObjectStorageError(`R2 copy failed with status ${response.status}.`, "STORAGE_UNAVAILABLE");
      }
    },

    async deleteObject(key: string): Promise<void> {
      const response = await signedRequest(objectUrl(baseUrl, key), { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new ObjectStorageError(`R2 delete failed with status ${response.status}.`, "STORAGE_UNAVAILABLE");
      }
    }
  };
}

function objectUrl(baseUrl: string, key: string, expiresInSeconds?: number): string {
  const url = new URL(`${baseUrl}/${encodeObjectKey(key)}`);
  if (expiresInSeconds !== undefined) {
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  }
  return url.toString();
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
