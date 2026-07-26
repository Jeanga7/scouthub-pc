import {
  ProjectUseCases,
  type Clock,
  type IdGenerator
} from "@scouthub/application";
import { createPgProjectRepository } from "@scouthub/infrastructure";
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

export function createProjectUseCases(): ProjectUseCases {
  const env = getServerEnv();
  return new ProjectUseCases(
    createPgProjectRepository(env.DATABASE_URL),
    ids,
    clock
  );
}

