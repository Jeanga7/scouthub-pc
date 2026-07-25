import { IdentityUseCases, type Clock, type IdGenerator } from "@scouthub/application";
import {
  createPgIdentityRepository
} from "@scouthub/infrastructure";
import { getServerEnv } from "@/env/server";
import { createClerkIdentityProvider } from "./clerk";

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

export function createIdentityUseCases(): IdentityUseCases {
  const env = getServerEnv();
  return new IdentityUseCases(
    createPgIdentityRepository(env.DATABASE_URL),
    createClerkIdentityProvider(),
    ids,
    clock,
    env.APP_ORIGIN
  );
}

