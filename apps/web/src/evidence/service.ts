import {
  EvidenceUseCases,
  FakeObjectStorage,
  type Clock,
  type IdGenerator,
  type ObjectStorage
} from "@scouthub/application";
import {
  createPgEvidenceRepository,
  createR2ObjectStorageAdapter
} from "@scouthub/infrastructure";
import { getServerEnv } from "@/env/server";

const ids: IdGenerator = {
  generate() {
    return crypto.randomUUID();
  }
};

const clock: Clock = {
  now() {
    return new Date();
  }
};

export function createEvidenceUseCases(): EvidenceUseCases {
  const env = getServerEnv();
  return new EvidenceUseCases(
    createPgEvidenceRepository(env.DATABASE_URL),
    createObjectStorage(env),
    ids,
    clock
  );
}

function createObjectStorage(env: ReturnType<typeof getServerEnv>): ObjectStorage {
  if (env.APP_ENV === "local" || env.APP_ENV === "test") {
    return new FakeObjectStorage();
  }
  return createR2ObjectStorageAdapter({
    accountId: requireEnv(env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID"),
    bucketName: requireEnv(env.R2_BUCKET_NAME, "R2_BUCKET_NAME"),
    accessKeyId: requireEnv(env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv(env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY")
  });
}

function requireEnv(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
