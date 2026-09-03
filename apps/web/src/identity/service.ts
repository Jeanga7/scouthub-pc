import { IdentityUseCases, type Clock, type IdGenerator } from "@scouthub/application";
import {
  createLocalIdentityProviderAdapter,
  createPgIdentityRepository
} from "@scouthub/infrastructure";
import { getServerEnv } from "@/env/server";
import { createClerkIdentityProvider } from "./clerk";
import { localDemoPersonas } from "./local-personas";
import { isLocalIdentityMode } from "./local-mode";

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
  const identityProvider = isLocalIdentityMode(env)
    ? createLocalIdentityProviderAdapter({ appEnv: env.APP_ENV, personas: localDemoPersonas })
    : createClerkIdentityProvider();
  return new IdentityUseCases(
    createPgIdentityRepository(env.DATABASE_URL),
    identityProvider,
    ids,
    clock,
    env.APP_ORIGIN
  );
}
